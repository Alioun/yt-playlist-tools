from pathlib import Path
import gzip,json

records=[]
for name,budget in [('kit-www',28000),('kit-music',27000),('core-www',5000)]:
    root=Path('tools/fixtures/site-toaster/.output')/name
    js=list(root.rglob('*.js'));maps=list(root.rglob('*.js.map'))
    assert js and maps, f'{name} has no bundle or source map'
    assert not list(root.rglob('*.css')), 'page bundle emitted CSS'
    sources=[s for p in maps for s in json.loads(p.read_text())['sources']]
    assert not any(any(x in s for x in ['bits-ui','tailwind','shadcn','sonner']) for s in sources), 'forbidden eager package'
    if name=='core-www':
        assert not any('node_modules/svelte/' in s or '/site/kit/' in s for s in sources), 'kit-free bundle contains kit or Svelte'
    else:
        assert any('Toast.svelte' in s for s in sources), 'actual Toast component omitted'
        assert any('node_modules/svelte/' in s for s in sources), 'actual Svelte runtime omitted'
    size=sum(len(gzip.compress(p.read_bytes(),compresslevel=9,mtime=0)) for p in js)
    assert size<=budget, f'{name} exceeds its complete-row ceiling'
    records.append({'bundle':name,'gzip9':size,'ceiling':budget,'scope':'dormant subset only, full production row still owed'})
print(json.dumps(records))
