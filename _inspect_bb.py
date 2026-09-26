import inspect
from backboard import client as c
print("attrs", [a for a in dir(c) if not a.startswith("_")])
print("file", inspect.getsourcefile(c))
for name in ["BackboardClient", "Client", "AsyncClient"]:
    if hasattr(c, name):
        obj = getattr(c, name)
        print("===", name, "===")
        print([m for m in dir(obj) if not m.startswith("_")])
        try:
            print(inspect.signature(obj.__init__))
        except Exception as e:
            print("sig err", e)
