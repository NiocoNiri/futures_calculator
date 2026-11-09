import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


class PublicAccessTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('public_app', Path(__file__).with_name('app.py'))
        self.app = importlib.util.module_from_spec(spec)
        # Existing deployment settings must no longer enable authentication.
        with patch.dict(os.environ, {
            'SITE_USERNAME': 'owner', 'SITE_PASSWORD': 'old-password',
            'REQUIRE_AUTH': 'true', 'HOST': '0.0.0.0',
        }):
            spec.loader.exec_module(self.app)

    def request(self, path, method='GET', payload=None, authorization=None):
        body = json.dumps(payload).encode() if payload is not None else b''
        environ = {
            'PATH_INFO': path, 'REQUEST_METHOD': method,
            'CONTENT_TYPE': 'application/json', 'CONTENT_LENGTH': str(len(body)),
            'wsgi.input': io.BytesIO(body),
        }
        if authorization is not None:
            environ['HTTP_AUTHORIZATION'] = authorization
        response = Mock()
        result = b''.join(self.app.application(environ, response))
        status, headers = response.call_args.args
        self.assertNotIn('WWW-Authenticate', dict(headers))
        return status, result

    def test_page_and_api_without_credentials(self):
        market = {'instruments': []}
        with patch.object(self.app, 'get_market', return_value=market), patch.object(
            self.app, 'calculate', return_value={'profit': '20'}
        ) as calculate:
            for authorization in (None, 'Basic invalid', 'Bearer stale-token'):
                for method in ('GET', 'HEAD'):
                    for path in ('/', '/api/market', '/health'):
                        status, body = self.request(path, method, authorization=authorization)
                        self.assertEqual(status, '200 OK')
                        if method == 'HEAD':
                            self.assertEqual(body, b'')
                status, body = self.request('/api/calculate', 'POST', {'count': 1}, authorization)
                self.assertEqual(status, '200 OK')
                self.assertEqual(json.loads(body), {'profit': '20'})
            calculate.assert_called_with({'count': 1})
            self.assertEqual(self.request('/missing')[0], '404 Not Found')

    def test_public_startup_with_legacy_auth_settings(self):
        server = Mock()
        waitress = types.SimpleNamespace(create_server=Mock(return_value=server))
        with patch.dict(sys.modules, {'waitress': waitress}), patch.object(
            self.app.threading, 'Thread'
        ) as worker, patch.object(self.app.signal, 'signal'):
            self.app.main()
        self.assertEqual(waitress.create_server.call_args.kwargs['host'], '0.0.0.0')
        server.run.assert_called_once()
        server.close.assert_called_once()
        worker.return_value.start.assert_called_once()


if __name__ == '__main__':
    unittest.main()
