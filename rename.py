import os
import re

def main():
    root_dir = r"d:\agenticPay"
    exclude_dirs = {'.git', 'node_modules', 'venv', '__pycache__', '.pytest_cache', 'dist', 'build'}

    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for filename in filenames:
            if filename.endswith('.pyc') or filename.endswith('.jpg') or filename.endswith('.png') or filename.endswith('.svg') or filename.endswith('.json'):
                if filename not in ['package.json', 'agentic-commerce.json']:
                    continue

            filepath = os.path.join(dirpath, filename)
            
            # Skip this script itself
            if filename == 'rename.py':
                continue

            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception:
                continue # likely binary or decoding error

            original_content = content
            lines = content.splitlines(keepends=True)
            new_lines = []

            for line in lines:
                if 'postgresql://' in line:
                    new_lines.append(line)
                    continue

                new_line = line
                new_line = new_line.replace('AgenticPay', 'AIBuyable')
                new_line = new_line.replace('agenticpay', 'aibuyable')
                new_line = new_line.replace('Agentic Pay', 'AIBuyable')
                new_lines.append(new_line)

            new_content = "".join(new_lines)
            if new_content != original_content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated: {filepath}")

if __name__ == '__main__':
    main()
