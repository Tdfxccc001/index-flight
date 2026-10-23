"""Inspect working files and every reachable Git blob; never print matched values.

Findings go into ignored test-results/. This is a heuristic review aid, not proof
that a repository is safe. --enforce blocks CI on private files or likely secrets.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = {
    'docs/LOCAL_DATA_REPORT.md', 'docs/local_inventory.json',
    'docs/local_candidates.json',
}
PATTERNS = {
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'github-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'api-key': re.compile(rb'\b(?:AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{35})\b'),
    'credential-assignment': re.compile(rb'''(?i)(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|authorization|cookie)\s*[=:]\s*["']([^"'\r\n]{12,})["']'''),
    'private-windows-path': re.compile(rb'[A-Za-z]:\\+(?:Users|\xe6\x95\xb0\xe6\x8d\xae\xe4\xb8\x93\xe9\xa1\xb9\xe8\xb5\x9b2026)\\+'),
}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def findings(data):
    # Binary fonts/images cannot contain executable config; still scan for tokens.
    return [kind for kind, pattern in PATTERNS.items() if pattern.search(data)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enforce', action='store_true')
    args = parser.parse_args()
    report = {'workingFiles': 0, 'historyBlobs': 0, 'workingFindings': [], 'historyFindings': []}
    paths = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').decode().split('\0')
    for name in sorted(set(filter(None, paths))):
        path = ROOT / name
        if not path.is_file():
            continue
        report['workingFiles'] += 1
        kinds = findings(path.read_bytes())
        if name in PRIVATE:
            kinds.append('private-competition-report')
        if path.name == '.env' or (path.name.startswith('.env.') and path.name != '.env.example'):
            kinds.append('environment-file')
        if kinds:
            report['workingFindings'].append({'path': name, 'kinds': kinds})
    objects = git('rev-list', '--objects', '--all').decode().splitlines()
    payload = ''.join(line.split(' ', 1)[0] + '\n' for line in objects).encode()
    batch = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    output, _ = batch.communicate(payload)
    offset = 0
    for entry in objects:
        end = output.index(b'\n', offset)
        header = output[offset:end].split()
        size = int(header[2])
        data = output[end + 1:end + 1 + size]
        offset = end + size + 2
        if header[1] != b'blob':
            continue
        report['historyBlobs'] += 1
        oid, _, name = entry.partition(' ')
        kinds = findings(data)
        if name in PRIVATE:
            kinds.append('private-competition-report')
        if kinds:
            report['historyFindings'].append({'blob': oid, 'path': name, 'kinds': kinds})
    target = ROOT / 'test-results/publish-safety.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in report.items()}))
    for section in ('workingFindings', 'historyFindings'):
        for row in report[section]:
            print(section, row['path'], ', '.join(row['kinds']))
    if args.enforce and (report['workingFindings'] or report['historyFindings']):
        raise SystemExit('Public release blocked: review test-results/publish-safety.json locally.')


if __name__ == '__main__':
    main()
