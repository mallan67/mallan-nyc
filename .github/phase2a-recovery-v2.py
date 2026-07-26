from pathlib import Path
import os
import subprocess
import sys

ORIGINAL_PART00_BLOB = "ca854993916797ec4cbedfbd9bdad7cd495e1e85"
BRANCH = "fix/neon-write-amp-phase2a-media-reconcile-2026-07-26"
ERROR_PATH = Path(".github/phase2a-recovery.error.log")
SELF_PATH = Path(".github/phase2a-recovery-v2.py")


def run(cmd, **kwargs):
    return subprocess.run(cmd, text=True, **kwargs)


original = subprocess.check_output(
    ["git", "cat-file", "blob", ORIGINAL_PART00_BLOB], text=True
)
part01 = Path(".github/phase2a-recovery.part01").read_text()
script_path = Path("/tmp/phase2a-recovery-original.py")
script_path.write_text(original + part01)

result = run(
    [sys.executable, str(script_path)],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
)

if result.returncode != 0:
    diagnostic = (
        "Phase 2A recovery failed before validation.\n"
        f"exit_code={result.returncode}\n"
        f"branch={BRANCH}\n"
        f"head={subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()}\n\n"
        "--- recovery output ---\n"
        + result.stdout
    )
    ERROR_PATH.write_text(diagnostic)
    print(diagnostic)

    # Persist the exact failure on the PR branch. The checkout token already has
    # contents:write. This diagnostic commit touches no Neon-sensitive path.
    run(["git", "config", "user.name", "github-actions[bot]"], check=True)
    run(
        [
            "git",
            "config",
            "user.email",
            "41898282+github-actions[bot]@users.noreply.github.com",
        ],
        check=True,
    )
    run(["git", "add", str(ERROR_PATH)], check=True)
    run(
        [
            "git",
            "commit",
            "-m",
            "chore: capture Phase 2A recovery failure",
        ],
        check=True,
    )
    run(["git", "push", "origin", f"HEAD:{BRANCH}"], check=True)
    raise SystemExit(result.returncode)

# The original script removed its two payloads and workflow. Remove this wrapper
# too so the final implementation commit contains no recovery machinery.
SELF_PATH.unlink(missing_ok=True)
ERROR_PATH.unlink(missing_ok=True)
print(result.stdout)
