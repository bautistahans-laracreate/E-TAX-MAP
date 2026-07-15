import re
import os

def replace_in_file(file_path, replacements):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements.items():
        content = content.replace(old, new)
    
    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)

replacements = {
    'padding: 24px 32px;': 'padding: 1.5rem 2rem;',
    'width: 90px;': 'width: 5.625rem;',
    'width: 260px;': 'width: 16.25rem;',
    'min-height: 90px;': 'min-height: 5.625rem;',
    'width: 60px; height: 60px;': 'width: 3.75rem; height: 3.75rem;',
    'padding: 18px 15px;': 'padding: 1.125rem 0.9375rem;',
    'gap: 20px;': 'gap: 1.25rem;',
    'padding: 12px 33px;': 'padding: 0.75rem 2.0625rem;',
    'border-left: 3px solid transparent;': 'border-left: 0.1875rem solid transparent;',
    'padding: 10px 22px 10px 60px;': 'padding: 0.625rem 1.375rem 0.625rem 3.75rem;',
    'padding-left: 33px;': 'padding-left: 2.0625rem;',
    'padding: 6px 0;': 'padding: 0.375rem 0;',
    'padding: 4px 0 12px;': 'padding: 0.25rem 0 0.75rem;',
    'padding: 14px 32px;': 'padding: 0.875rem 2rem;',
    'height: 68px;': 'height: 4.25rem;',
    'border-radius: 40px;': 'border-radius: 2.5rem;',
    'padding: 6px 18px 6px 6px;': 'padding: 0.375rem 1.125rem 0.375rem 0.375rem;',
    'width: 38px; height: 38px;': 'width: 2.375rem; height: 2.375rem;',
    'margin: 0 0 24px 0;': 'margin: 0 0 1.5rem 0;',
    'margin-bottom: 28px;': 'margin-bottom: 1.75rem;',
    'padding: 22px 24px;': 'padding: 1.375rem 1.5rem;',
    'height: 320px;': 'height: 20rem;',
    'padding: 20px;': 'padding: 1.25rem;',
    'margin-bottom: 14px;': 'margin-bottom: 0.875rem;',
    'padding: 10px 20px;': 'padding: 0.625rem 1.25rem;',
    'padding: 9px 20px;': 'padding: 0.5625rem 1.25rem;',
    'max-height: 400px;': 'max-height: 25rem;',
    'padding: 13px 20px;': 'padding: 0.8125rem 1.25rem;',
    'padding: 12px 20px;': 'padding: 0.75rem 1.25rem;',
    'padding: 4px 14px;': 'padding: 0.25rem 0.875rem;',
    'width: 800px;': 'width: min(90vw, 50rem);',
    'padding: 20px 28px;': 'padding: 1.25rem 1.75rem;',
    'padding: 40px;': 'padding: 2.5rem;',
    'padding-bottom: 16px;': 'padding-bottom: 1rem;',
    'padding: 10px 14px;': 'padding: 0.625rem 0.875rem;',
    'padding: 8px 14px;': 'padding: 0.5rem 0.875rem;',
}

css_file = r'frontend\src\App.css'
replace_in_file(css_file, replacements)
print(f"Refactor complete for {css_file}")
