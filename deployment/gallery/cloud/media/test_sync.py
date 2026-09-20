import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import sync

def image(value=b'\xff\xd8\xff\xd9'):
    return dict(kind='media', key='gallery/v1/'+hashlib.sha256(value).hexdigest()+'.jpg',
                contentType='image/jpeg', data=base64.b64encode(value).decode())

class Cloud:
    def __init__(self): self.objects = {}; self.refreshes = []; self.fail = False
    def ensure(self, key, data, content_type):
        if self.fail: raise RuntimeError('synthetic upload failure')
        changed = self.objects.get(key) != data
        self.objects[key] = data
        return changed
    def delete(self, key): self.objects.pop(key, None)
    def refresh(self, keys): self.refreshes.extend(keys)

class SyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); (self.root/'public').mkdir()
        self.cloud = Cloud()
        p = patch.object(sync, 'probe_access'); self.probe = p.start(); self.addCleanup(p.stop)
    def run_sync(self, items, now=1000, failures=0):
        return sync.reconcile(iter([*items, dict(kind='complete', count=len(items), failures=failures)]),
                              self.cloud, self.root, {}, now)
    def ready(self): return json.loads((self.root/'public/ready.json').read_text())['objects']
    def test_reuse_and_content_replacement(self):
        old, new = image(), image(b'\xff\xd8new')
        self.assertEqual(self.run_sync([old])['uploaded'], 1)
        self.assertEqual(self.run_sync([old], 1100)['uploaded'], 0)
        self.run_sync([new], 1800)
        self.assertNotIn(old['key'], self.cloud.objects)
        self.assertEqual(list(self.ready()), [new['key']])
        self.assertEqual(self.cloud.refreshes, [old['key']])
    def test_removal_grace_and_shared_reference(self):
        item = image(); self.run_sync([item]); self.run_sync([item], 1500)
        self.run_sync([], 1600)
        self.assertEqual(self.ready(), {})
        self.assertIn(item['key'], self.cloud.objects)
        self.run_sync([], 2101)
        self.assertEqual(self.cloud.objects, {})
    def test_upload_failure_is_not_ready_and_retries(self):
        self.cloud.fail = True
        self.assertEqual(self.run_sync([image()])['failures'], 1)
        self.assertEqual(self.ready(), {})
        self.cloud.fail = False
        self.assertEqual(self.run_sync([image()], 1100)['uploaded'], 1)
        self.assertTrue(self.ready())
    def test_partial_export_does_not_delete_previous_objects(self):
        self.run_sync([image()])
        with self.assertRaises(ValueError): sync.reconcile(iter([]), self.cloud, self.root, {}, 3000)
        self.assertTrue(self.cloud.objects)
        self.run_sync([], 3000, failures=1)
        self.assertTrue(self.cloud.objects)
    def test_checksum_path_and_format_rejection(self):
        for mutation in [dict(key='gallery/../../private.jpg'), dict(data='eA=='), dict(contentType='text/html')]:
            with self.assertRaises(ValueError): sync.validated_image({**image(), **mutation})
        self.assertFalse(self.cloud.objects)
    def test_auth_probe_failure_disables_redirects(self):
        self.run_sync([image()]); self.probe.side_effect = RuntimeError('probe failed')
        with self.assertRaises(RuntimeError): self.run_sync([image()], 1100)
        self.assertEqual(self.ready(), {})
    def test_unfinished_upload_is_journaled_for_later_cleanup(self):
        self.cloud.fail = True; self.run_sync([image()])
        self.assertIn(image()['key'], json.loads((self.root/'ledger.json').read_text()))
        self.cloud.fail = False; self.run_sync([], 1700)
        self.assertEqual(json.loads((self.root/'ledger.json').read_text()), {})
    def test_sdk_wrapped_missing_object_uploads_but_forbidden_does_not(self):
        import alibabacloud_oss_v2 as oss
        cloud = sync.Cloud.__new__(sync.Cloud)
        cloud.oss = oss; cloud.config = {'bucket': 'test'}; cloud.client = MagicMock()
        for status in (404, 403):
            cloud.client.reset_mock()
            cloud.client.head_object.side_effect = oss.exceptions.OperationError(
                name='HeadObject', error=oss.exceptions.ServiceError(status_code=status, code='Synthetic',
                    request_id='test', message='test', ec='', timestamp='', request_target=''))
            if status == 404:
                self.assertTrue(cloud.ensure(image()['key'], b'\xff\xd8\xff\xd9', 'image/jpeg'))
                self.assertEqual(cloud.client.put_object.call_count, 1)
            else:
                with self.assertRaises(oss.exceptions.OperationError):
                    cloud.ensure(image()['key'], b'\xff\xd8\xff\xd9', 'image/jpeg')
                cloud.client.put_object.assert_not_called()

if __name__ == '__main__': unittest.main()
