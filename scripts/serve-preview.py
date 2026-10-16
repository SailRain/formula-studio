"""Development preview for both root and GitHub Pages project URLs."""
import argparse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1] / 'dist'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8768)
parser.add_argument('--base-path', default='/formula-studio/',
                    help='Additional project URL prefix mounted beside /')
parser.add_argument('--pages', action='store_true',
                    help='Omit custom security response headers, as on GitHub Pages')
args = parser.parse_args()
BASE_PATH = '/' + args.base_path.strip('/') + '/' if args.base_path.strip('/') else '/'


def local_path(path):
    if BASE_PATH != '/' and path.startswith(BASE_PATH):
        return '/' + path[len(BASE_PATH):]
    return path


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.wasm': 'application/wasm'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        split = urlsplit(path)
        return super().translate_path(local_path(split.path))

    def do_GET(self):
        split = urlsplit(self.path)
        if BASE_PATH != '/' and split.path == BASE_PATH.rstrip('/'):
            self.send_response(301)
            self.send_header('Location', BASE_PATH + ('?' + split.query if split.query else ''))
            self.end_headers()
            return
        path = local_path(split.path)
        if split.query and path != '/licenses/third-party.html' and (path, split.query) not in [
            ('/engine-worker.js', 'engine=xetex'),
            ('/engine-worker.js', 'engine=dvipdfm'),
            ('/formula-worker.js', 'engine=xetex'),
            ('/formula-worker.js', 'engine=dvipdfm'),
        ]:
            self.send_error(404)
            return
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            # Cancelling a compilation may abort large WASM/font downloads.
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        if not args.pages:
            self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src blob: data:; font-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, *args):
        pass


print(f'Formula Studio preview: http://127.0.0.1:{args.port}/', flush=True)
if BASE_PATH != '/':
    print(f'Project URL preview: http://127.0.0.1:{args.port}{BASE_PATH}', flush=True)
try:
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
except KeyboardInterrupt:
    pass
