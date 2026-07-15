import subprocess
import os

def run_git(args):
    try:
        result = subprocess.run(['git'] + args, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except Exception as e:
        return f"Error: {e}"

print("Remotes:")
print(run_git(['remote', '-v']))
print("\nUser Name:")
print(run_git(['config', 'user.name']))
print("\nUser Email:")
print(run_git(['config', 'user.email']))
