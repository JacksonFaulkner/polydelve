import manifest from '../../model-manifest.json';

interface Field {
  name: string;
  type: string;
  default: string | null;
  description: string | null;
}

interface Model {
  name: string;
  fields: Field[];
  lineno: number;
}

const tdBase: React.CSSProperties = {
  padding: '6px 12px 6px 0',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--color-fd-border)',
  fontSize: '0.8125rem',
};

const mono: React.CSSProperties = { fontFamily: 'monospace' };

export function ModelReference() {
  const models = manifest as Model[];

  return (
    <div>
      {models.map((model) => (
        <section key={model.name} id={model.name.toLowerCase()} style={{ marginBottom: '3rem' }}>
          <h2 style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            {model.name}
          </h2>
          {model.fields.length === 0 ? (
            <p style={{ color: 'var(--color-fd-muted-foreground)', fontSize: '0.875rem' }}>
              No fields (inherits parent)
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...tdBase, fontWeight: 600, width: '20%' }}>Field</th>
                  <th style={{ ...tdBase, fontWeight: 600, width: '25%', paddingLeft: 12 }}>Type</th>
                  <th style={{ ...tdBase, fontWeight: 600, paddingLeft: 12 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {model.fields.map((field) => (
                  <tr key={field.name}>
                    <td style={{ ...tdBase, ...mono }}>{field.name}</td>
                    <td style={{ ...tdBase, ...mono, paddingLeft: 12, color: 'var(--color-fd-muted-foreground)' }}>
                      {field.type}
                    </td>
                    <td style={{ ...tdBase, paddingLeft: 12, color: field.description ? 'inherit' : 'var(--color-fd-muted-foreground)' }}>
                      {field.description ?? <span style={{ opacity: 0.35 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
