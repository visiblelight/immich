import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from cryptography.x509.verification import Store

import cloud_certificate as app


def certificate_pair(domain="cdn.ke.ink", days=60):
    now = datetime.now(timezone.utc)
    ca_key = ec.generate_private_key(ec.SECP256R1())
    key = ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Gallery test CA")])
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
          .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
          .not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=365))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, None, None), critical=True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
          .sign(ca_key, hashes.SHA256()))
    leaf = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, domain)]))
            .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=days))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName(domain)]), critical=False)
            .add_extension(x509.KeyUsage(True, False, False, False, False, False, False, None, None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
            .sign(ca_key, hashes.SHA256()))
    return (leaf.public_bytes(serialization.Encoding.PEM),
            key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                              serialization.NoEncryption()), Store([ca]), leaf)


class CertificateTests(unittest.TestCase):
    def test_accept_matching_trusted_certificate(self):
        chain, key, store, leaf = certificate_pair()
        self.assertEqual(app.validate_bundle("cdn.ke.ink", chain, key, store), leaf)

    def test_reject_wrong_domain_key_and_near_expiry_before_upload(self):
        chain, key, store, _ = certificate_pair()
        _, other_key, _, _ = certificate_pair()
        with self.assertRaises(ValueError):
            app.validate_bundle("other.ke.ink", chain, key, store)
        with self.assertRaises(ValueError):
            app.validate_bundle("cdn.ke.ink", chain, other_key, store)
        short, short_key, short_store, _ = certificate_pair(days=2)
        with self.assertRaises(ValueError):
            app.validate_bundle("cdn.ke.ink", short, short_key, short_store)

    def test_reject_untrusted_staging_chain(self):
        chain, key, _, _ = certificate_pair()
        _, _, unrelated_store, _ = certificate_pair()
        with self.assertRaises(Exception):
            app.validate_bundle("cdn.ke.ink", chain, key, unrelated_store)

    def test_dns_hook_refuses_other_name_or_invalid_token(self):
        config = {"validation_zone": "acme-cdn.ke.ink"}
        app.check_challenge(config, "_acme-challenge.acme-cdn.ke.ink", "A" * 43)
        for name, value in [("_acme-challenge.ke.ink", "A" * 43),
                            ("_acme-challenge.acme-cdn.ke.ink", "bad")]:
            with self.assertRaises(ValueError):
                app.check_challenge(config, name, value)

    def test_dns_cleanup_only_removes_exact_challenge(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        dns = object.__new__(app.DNS)
        dns.zone = "acme-cdn.ke.ink"
        dns.client = Mock()
        records = [{"RR": rr, "Type": typ, "Value": val, "RecordId": str(i)}
                   for i, (rr, typ, val) in enumerate([
                       ("_acme-challenge", "TXT", "A" * 43),
                       ("_acme-challenge", "TXT", "B" * 43),
                       ("other", "TXT", "A" * 43),
                       ("_acme-challenge", "CNAME", "A" * 43)])]
        dns.client.describe_domain_records_with_options.return_value = SimpleNamespace(
            body=SimpleNamespace(to_map=lambda: {"DomainRecords": {"Record": records}, "TotalCount": 4}))
        dns.remove("A" * 43)
        self.assertEqual(dns.client.delete_domain_record_with_options.call_count, 1)
        self.assertEqual(dns.client.delete_domain_record_with_options.call_args.args[0].record_id, "0")

    def test_failed_propagation_cleans_up_current_challenge(self):
        from unittest.mock import Mock
        dns = Mock()
        with patch.object(app, "wait_for_txt", side_effect=RuntimeError("not propagated")), \
                self.assertRaises(RuntimeError):
            app.add_challenge({}, dns, "A" * 43)
        dns.add.assert_called_once_with("A" * 43)
        dns.remove.assert_called_once_with("A" * 43)

    def test_deployment_retries_when_live_certificate_differs(self):
        chain, key, store, leaf = certificate_pair()
        fingerprint = leaf.fingerprint(hashes.SHA256()).hex()
        with tempfile.TemporaryDirectory() as tmp:
            config = {"domain": "cdn.ke.ink", "state_dir": tmp}
            folder = Path(tmp) / "certs/cdn.ke.ink_ecc"
            folder.mkdir(parents=True)
            (folder / "fullchain.cer").write_bytes(chain)
            (folder / "cdn.ke.ink.key").write_bytes(key)
            (folder / "cdn.ke.ink.key").chmod(0o600)
            with patch.object(app, "trust_store", return_value=store), \
                    patch.object(app, "live_fingerprint", side_effect=["old", fingerprint]), \
                    patch.object(app, "upload") as upload:
                app.sync(config, timeout=1)
                upload.assert_called_once()
            status = json.loads((Path(tmp) / "status.json").read_text())
            self.assertEqual(status["fingerprint"], fingerprint)
            with patch.object(app, "trust_store", return_value=store), \
                    patch.object(app, "live_fingerprint", return_value=fingerprint), \
                    patch.object(app, "upload") as upload:
                app.sync(config, timeout=1)
                upload.assert_not_called()

    def test_no_success_marker_when_cdn_does_not_update(self):
        chain, key, store, _ = certificate_pair()
        with tempfile.TemporaryDirectory() as tmp:
            config = {"domain": "cdn.ke.ink", "state_dir": tmp}
            folder = Path(tmp) / "certs/cdn.ke.ink_ecc"
            folder.mkdir(parents=True)
            (folder / "fullchain.cer").write_bytes(chain)
            (folder / "cdn.ke.ink.key").write_bytes(key)
            (folder / "cdn.ke.ink.key").chmod(0o600)
            with patch.object(app, "trust_store", return_value=store), \
                    patch.object(app, "live_fingerprint", return_value="old"), \
                    patch.object(app, "upload"), self.assertRaises(RuntimeError):
                app.sync(config, timeout=0)
            self.assertFalse((Path(tmp) / "status.json").exists())


if __name__ == "__main__":
    unittest.main()
