#!/usr/bin/env python3
"""ACME hooks using an ECS role; never persist or log cloud credentials."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import ssl
import sys
import time

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.x509.verification import PolicyBuilder, Store

DOMAIN_RE = re.compile(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\Z")
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{43}\Z")


def load_config(filename: str) -> dict:
    config = json.loads(Path(filename).read_text())
    for field in ("domain", "validation_zone"):
        if not DOMAIN_RE.fullmatch(config[field]):
            raise ValueError("Invalid configured domain")
    if config["domain"] == config["validation_zone"]:
        raise ValueError("Use an independent validation zone")
    if not re.fullmatch(r"[A-Za-z0-9-]{1,64}", config["role_name"]):
        raise ValueError("Invalid role name")
    if not Path(config["state_dir"]).is_absolute():
        raise ValueError("State directory must be absolute")
    return config


def credentials(config: dict):
    from alibabacloud_credentials.client import Client
    from alibabacloud_credentials.models import Config
    # Explicit provider: do not silently fall back to environment AccessKeys.
    return Client(Config(type="ecs_ram_role", role_name=config["role_name"],
                         enable_imds_v2=True, disable_imds_v1=True))


def runtime_options():
    from alibabacloud_tea_util.models import RuntimeOptions
    return RuntimeOptions(connect_timeout=10000, read_timeout=30000,
                          autoretry=False)


class DNS:
    def __init__(self, config: dict):
        from alibabacloud_alidns20150109.client import Client
        from alibabacloud_tea_openapi.models import Config
        self.zone = config["validation_zone"]
        self.client = Client(Config(credential=credentials(config),
                                    endpoint="alidns.aliyuncs.com", protocol="https"))

    def matching(self, value: str) -> list[dict]:
        from alibabacloud_alidns20150109.models import DescribeDomainRecordsRequest
        records = []
        page = 1
        while True:
            result = self.client.describe_domain_records_with_options(
                DescribeDomainRecordsRequest(domain_name=self.zone, rrkey_word="_acme-challenge",
                                             type_key_word="TXT", search_mode="EXACT",
                                             page_number=page, page_size=100), runtime_options()).body.to_map()
            batch = result.get("DomainRecords", {}).get("Record", [])
            # Server filters are not a substitute for checking every record before deletion.
            records.extend(r for r in batch if r.get("RR") == "_acme-challenge"
                           and r.get("Type") == "TXT" and r.get("Value") == value)
            if page * 100 >= result.get("TotalCount", 0):
                return records
            page += 1
            if page > 100:
                raise RuntimeError("Unexpected DNS pagination")

    def add(self, value: str):
        from alibabacloud_alidns20150109.models import AddDomainRecordRequest
        if not self.matching(value):
            self.client.add_domain_record_with_options(AddDomainRecordRequest(
                domain_name=self.zone, rr="_acme-challenge", type="TXT", value=value, ttl=600),
                runtime_options())

    def remove(self, value: str):
        from alibabacloud_alidns20150109.models import DeleteDomainRecordRequest
        for record in self.matching(value):
            self.client.delete_domain_record_with_options(
                DeleteDomainRecordRequest(record_id=record["RecordId"]), runtime_options())


def check_challenge(config: dict, name: str, value: str):
    if name != "_acme-challenge." + config["validation_zone"] or not TOKEN_RE.fullmatch(value):
        raise ValueError("Refusing a challenge outside the configured validation name")


def wait_for_txt(config: dict, value: str, timeout: int = 900):
    import dns.resolver
    deadline = time.monotonic() + timeout
    # Check the public name, including its delegation, rather than only the alias target.
    while time.monotonic() < deadline:
        try:
            answer = dns.resolver.resolve("_acme-challenge." + config["domain"], "TXT", lifetime=10)
            if any(b"".join(r.strings).decode("ascii") == value for r in answer):
                return
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers,
                dns.exception.Timeout):
            pass
        time.sleep(15)
    raise RuntimeError("DNS challenge has not propagated through the public delegation")


def add_challenge(config: dict, dns: DNS, value: str):
    dns.add(value)
    try:
        wait_for_txt(config, value)
    except Exception:
        # acme.sh does not register a failed add hook for later cleanup.
        # Remove only this exact value when our propagation check fails.
        dns.remove(value)
        raise


def trust_store() -> Store:
    return Store([x509.load_der_x509_certificate(raw)
                  for raw in ssl.create_default_context().get_ca_certs(binary_form=True)])


def validate_bundle(domain: str, fullchain: bytes, key: bytes, store: Store | None = None,
                    now: datetime | None = None) -> x509.Certificate:
    now = now or datetime.now(timezone.utc)
    certs = x509.load_pem_x509_certificates(fullchain)
    if not certs:
        raise ValueError("Empty certificate chain")
    leaf = certs[0]
    sans = leaf.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    if sans.get_values_for_type(x509.DNSName) != [domain]:
        raise ValueError("Certificate must cover only the configured CDN domain")
    if leaf.not_valid_after_utc <= now + timedelta(days=7):
        raise ValueError("Certificate expires too soon")
    public = serialization.load_pem_private_key(key, password=None).public_key()
    encode = lambda k: k.public_bytes(serialization.Encoding.DER,
                                     serialization.PublicFormat.SubjectPublicKeyInfo)
    if encode(public) != encode(leaf.public_key()):
        raise ValueError("Certificate and private key do not match")
    # Reject staging/untrusted certificates before any API call to production CDN.
    PolicyBuilder().store(store or trust_store()).time(now).build_server_verifier(
        x509.DNSName(domain)).verify(leaf, certs[1:])
    return leaf


def live_fingerprint(domain: str) -> str:
    with socket.create_connection((domain, 443), timeout=15) as sock:
        with ssl.create_default_context().wrap_socket(sock, server_hostname=domain) as tls:
            return hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()


def upload(config: dict, chain: bytes, key: bytes, fingerprint: str):
    from alibabacloud_cdn20180510.client import Client
    from alibabacloud_cdn20180510.models import SetCdnDomainSSLCertificateRequest
    from alibabacloud_tea_openapi.models import Config
    client = Client(Config(credential=credentials(config), endpoint="cdn.aliyuncs.com", protocol="https"))
    client.set_cdn_domain_sslcertificate_with_options(SetCdnDomainSSLCertificateRequest(
        domain_name=config["domain"], cert_type="upload", sslprotocol="on",
        cert_name="gallery-le-" + fingerprint[:24], sslpub=chain.decode("ascii"),
        sslpri=key.decode("ascii")), runtime_options())


def sync(config: dict, timeout: int = 600):
    root = Path(config["state_dir"]).resolve()
    folder = root / "certs" / (config["domain"] + "_ecc")
    chain_file, key_file = folder / "fullchain.cer", folder / (config["domain"] + ".key")
    for file in (chain_file, key_file):
        if not file.resolve().is_relative_to(root):
            raise ValueError("Certificate path leaves the state directory")
    if key_file.stat().st_mode & 0o077:
        raise ValueError("Private key must not be readable by group/other")
    chain, key = chain_file.read_bytes(), key_file.read_bytes()
    leaf = validate_bundle(config["domain"], chain, key)
    fingerprint = leaf.fingerprint(hashes.SHA256()).hex()
    try:
        current = live_fingerprint(config["domain"])
    except (OSError, ssl.SSLError):
        current = None
    if current != fingerprint:
        try:
            upload(config, chain, key, fingerprint)
        except Exception as exc:
            # An earlier upload may have succeeded even if its response was lost.
            if getattr(exc, "code", "") not in {"CertificateContent.Duplicated", "Certificate.Duplicated"}:
                raise
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if live_fingerprint(config["domain"]) == fingerprint:
                    break
            except (OSError, ssl.SSLError):
                pass
            time.sleep(15)
        else:
            raise RuntimeError("CDN certificate propagation not verified; will retry next run")
    status = {"domain": config["domain"], "fingerprint": fingerprint,
              "expires_at": leaf.not_valid_after_utc.isoformat(),
              "verified_at": datetime.now(timezone.utc).isoformat()}
    temporary = root / "status.json.tmp"
    temporary.write_text(json.dumps(status, indent=2) + "\n")
    temporary.replace(root / "status.json")
    print(json.dumps(status))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/etc/gallery/cdn-certificate.json")
    parser.add_argument("action", choices=["dns-add", "dns-remove", "sync", "config"])
    parser.add_argument("args", nargs="*")
    args = parser.parse_args()
    config = load_config(args.config)
    if args.action == "config":
        if len(args.args) != 1 or args.args[0] not in config:
            raise ValueError("Expected one configuration field")
        print(config[args.args[0]])
    elif args.action == "sync":
        sync(config)
    else:
        if len(args.args) != 2:
            raise ValueError("Expected challenge name and value")
        name, value = args.args
        check_challenge(config, name, value)
        dns = DNS(config)
        if args.action == "dns-add":
            add_challenge(config, dns, value)
        else:
            dns.remove(value)


if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except Exception as exc:
        # SDK exceptions may include signed requests/private certificate material.
        code = str(getattr(exc, "code", ""))
        safe_code = code if re.fullmatch(r"[A-Za-z0-9_.-]{0,120}", code) else "redacted"
        print(f"Certificate task failed: {type(exc).__name__} {safe_code}", file=sys.stderr)
        sys.exit(1)
