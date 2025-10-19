"use client";
import React, { useEffect, useState } from "react";

type Member = { id?: number; id_number?: string; full_name?: string; mobile?: string };

export default function QRComponent({ member }: { member?: Member }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!member) {
      setDataUrl(null);
      return;
    }

    const payload = JSON.stringify({ id_number: member.id_number, full_name: member.full_name });
    let mounted = true;
    setLoading(true);

    import("qrcode")
      .then((qrcode) => qrcode.toDataURL(payload, { margin: 2, scale: 6 }))
      .then((url) => {
        if (mounted) setDataUrl(url);
      })
      .catch((err) => {
        console.error("QR generation error:", err);
        if (mounted) setDataUrl(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [member]);

  function downloadPNG() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    const name = (member?.full_name ?? "member").replace(/\s+/g, "_");
    a.href = dataUrl;
    a.download = `${name}_${member?.id_number ?? "qr"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!member) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-24 bg-white border rounded flex items-center justify-center overflow-hidden">
        {loading ? (
          <span className="text-xs text-gray-400">Generating...</span>
        ) : dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="qr" className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs text-red-400">No QR</span>
        )}
      </div>

      <div className="flex flex-col text-sm">
        <div className="font-medium text-gray-900">{member.full_name}</div>
        <div className="text-gray-600">{member.id_number}</div>
        <div className="mt-2">
          <button
            onClick={downloadPNG}
            disabled={!dataUrl}
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}