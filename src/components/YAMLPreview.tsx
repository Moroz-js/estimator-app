"use client";

export default function YAMLPreview({ value }: { value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      alert("Copied to clipboard");
    } catch (e) {
      alert("Failed to copy");
    }
  };

  return (
    <div className="grid">
      <div className="section">
        <h2>JSON</h2>
        <textarea readOnly value={value} />
        <div style={{marginTop: 8}}>
          <button className="btn" type="button" onClick={copy}>Copy</button>
        </div>
      </div>
    </div>
  );
}
