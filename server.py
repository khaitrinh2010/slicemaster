from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import mimetypes


class CORSHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.glb': 'model/gltf-binary',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_head(self):
        path = self.path.split('?', 1)[0]
        if path.endswith('/'):
            path = path + 'index.html'

        parsed_path = self.translate_path(path)
        if os.path.isdir(parsed_path):
            parsed_path = os.path.join(parsed_path, 'index.html')

        if not os.path.exists(parsed_path):
            return self.send_error(404)

        accept_encoding = (self.headers.get('Accept-Encoding', '') or '').lower()
        if 'gzip' in accept_encoding and os.path.exists(parsed_path + '.gz'):
            return self._serve_file(parsed_path + '.gz', is_gzip=True, original_path=parsed_path)

        return self._serve_file(parsed_path, is_gzip=False, original_path=parsed_path)

    def _serve_file(self, path, is_gzip=False, original_path=None):
        if not os.path.isfile(path):
            return self.send_error(404)

        ctype = mimetypes.guess_type(original_path or path)[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-type', ctype)
        self.send_header('Content-Length', str(os.path.getsize(path)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

        if is_gzip:
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')

        self.end_headers()
        if self.command == 'HEAD':
            return None

        with open(path, 'rb') as f:
            self.copyfile(f, self.wfile)
        return None


if __name__ == '__main__':
    HTTPServer(('', 5500), CORSHandler).serve_forever()
