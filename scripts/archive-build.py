"""Create clean source and Windows test archives without local user data."""
from pathlib import Path
import zipfile
import sys

root = Path(__file__).resolve().parent.parent
outputs = root.parent / 'outputs'
outputs.mkdir(exist_ok=True)

def archive(output, entries):
    temporary = output.with_suffix('.zip.partial')
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as result:
        for disk, name in entries:
            result.write(disk, name)
    temporary.replace(output)
    print(f'{output}: {output.stat().st_size} bytes', flush=True)

source_names = ['src', 'public', 'scripts', 'test', 'runtime-notices', '.github',
                'package.json', 'README.md', 'AUDIT.md', '.gitignore',
                'Setup-Mac.command', 'Setup-Windows.cmd', 'Start-Mac.command', 'Start-Windows.cmd']
source = []
for name in source_names:
    item = root / name
    files = sorted(item.rglob('*')) if item.is_dir() else [item]
    source.extend((file, file.relative_to(root).as_posix()) for file in files if file.is_file())
archive(outputs / 'Crosspost-Local-v0.1.zip', source)
if '--source-only' in sys.argv:
    sys.exit(0)

builds = sorted(path for path in (root / 'releases').glob('Crosspost-win32-*')
                if path.is_dir() and not path.name.endswith('.partial'))
build = builds[-1]
files = sorted(path for path in build.rglob('*') if path.is_file())
assert not any(set(path.relative_to(build).parts) & {'data', 'sessions', '.npm-cache'} for path in files)
archive(outputs / 'Crosspost-Windows-TEST.zip',
        [(file, 'Crosspost/' + file.relative_to(build).as_posix()) for file in files])
