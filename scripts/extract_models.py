"""
Extract Pydantic BaseModel subclasses from models.py → JSON manifest.
Uses ast (no imports, no venv needed).
Output: docs/model-manifest.json
"""

import ast
import json
import sys
from pathlib import Path


def unparse_annotation(node: ast.expr) -> str:
    return ast.unparse(node)


def extract_models(source_path: Path) -> list[dict]:
    tree = ast.parse(source_path.read_text())
    models = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        bases = []
        for b in node.bases:
            if isinstance(b, ast.Name):
                bases.append(b.id)
            elif isinstance(b, ast.Attribute):
                bases.append(b.attr)
        if not any("Model" in b or "Base" in b for b in bases):
            continue

        fields = []
        for item in node.body:
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                default = None
                description = None
                if item.value is not None:
                    try:
                        default = ast.unparse(item.value)
                    except Exception:
                        pass
                    # extract description from Field(description="...")
                    if isinstance(item.value, ast.Call):
                        for kw in item.value.keywords:
                            if kw.arg == "description" and isinstance(kw.value, ast.Constant):
                                description = kw.value.value
                                break
                fields.append({
                    "name": item.target.id,
                    "type": unparse_annotation(item.annotation),
                    "default": default,
                    "description": description,
                })

        models.append({
            "name": node.name,
            "fields": fields,
            "lineno": node.lineno,
        })

    return models


if __name__ == "__main__":
    repo_root = Path(__file__).parent.parent
    source = repo_root / "backend" / "models" / "models.py"
    out = repo_root / "docs" / "model-manifest.json"

    models = extract_models(source)
    out.write_text(json.dumps(models, indent=2))
    print(f"Wrote {len(models)} models → {out}", file=sys.stderr)
