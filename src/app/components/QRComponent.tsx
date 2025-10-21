"use client";
import React, { useEffect, useState } from "react";
import { encryptString } from "../../lib/crypto";

type Member = { id?: number; id_number?: string; full_name?: string; mobile?: string };

export default function QRComponent({ member }: { member?: Member }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passphrase = (process.env.NEXT_PUBLIC_QR_PASSPHRASE ?? "").trim();

  useEffect(() => {
    if (!member) {
      setDataUrl(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const payload = JSON.stringify({ id_number: member.id_number });
        let content = payload;

        // only encrypt if passphrase present (and not empty)
        if (passphrase) {
          try {
            content = await encryptString(payload, passphrase);
          } catch (e) {
            console.warn("QR encrypt failed, falling back to plaintext", e);
            content = payload;
          }
        }

        const qrcode = await import("qrcode");
        const url = await qrcode.toDataURL(content, { margin: 2, scale: 6 });
        setDataUrl(url);
      } catch (err) {
        console.error("QR generation error:", err);
        setDataUrl(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [member, passphrase]);

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