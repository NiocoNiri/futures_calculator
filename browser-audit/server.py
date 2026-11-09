import importlib.util
from pathlib import Path
from wsgiref.simple_server import WSGIRequestHandler, make_server

p=Path(__file__).resolve().parents[1] / 'deploy' / 'app.py'
spec=importlib.util.spec_from_file_location('app',p);app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)
names=list(app.ASSET_NAMES.items())+[(f'TEST{i}',f'Тестовый контракт {i}') for i in range(493)]
items=[dict(asset=base+'Z6',base=base,ticker=base+'-12.26',name=name,step='1',cost='2',margin='100',last='100',oi='1000',volume='500',expiry='2026-12-31',quote_date='2026-10-26',quote_time='12:00:00',fetched_at='2026-10-26T09:00:00+00:00',cached=False) for base,name in names]
app.market_cache={'instruments':items,'updated':'2026-10-26T09:00:00+00:00','warning':''}
class Quiet(WSGIRequestHandler):
 def log_message(self,*args):pass
with make_server('127.0.0.1',8765,app.application,handler_class=Quiet) as server:server.serve_forever()
