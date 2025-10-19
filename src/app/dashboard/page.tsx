"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import QRComponent from '../components/QRComponent';
import MemberForm from '../components/MemberForm';

// ...existing code...

export default function Dashboard() {
  const [members, setMembers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showQrFor, setShowQrFor] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // scanning related
  const [scanning, setScanning] = useState(false);
  const html5QrCodeRef = useRef<any | null>(null);
  const scannerId = "dashboard-reader";

  // modal state for showing member info (after scan or when user clicks Show QR)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMember, setModalMember] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("load members error:", error);
      alert(error.message);
      setMembers([]);
    } else {
      setMembers(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();

    // cleanup scanner on unmount
    return () => {
      stopScanner().catch(()=>{});
    };
  }, []);

  async function deleteMember(id: number) {
    if (!confirm('Delete member?')) return;
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) return alert(error.message);
    setMembers((s) => s.filter((m) => m.id !== id));
    if (showQrFor === id) setShowQrFor(null);
  }

  // onSaved may receive the inserted/updated row from MemberForm
  function handleSaved(row?: any) {
    if (!row) {
      load();
      return;
    }

    setMembers((prev) => {
      const exists = prev.find((p) => p.id === row.id);
      if (exists) return prev.map((p) => (p.id === row.id ? row : p));
      return [row, ...prev];
    });

    // hide other QR previews
    setShowQrFor(null);
  }

  // Start scanner (dynamic import to avoid SSR issues)
  async function startScanner() {
    setModalMember(null);
    setModalOpen(false);
    setScanning(true);
    try {
      const module = await import('html5-qrcode');
      const { Html5Qrcode } = module;
      // stop existing instance if any
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop().catch(()=>{});
        html5QrCodeRef.current.clear().catch(()=>{});
        html5QrCodeRef.current = null;
      }

      html5QrCodeRef.current = new Html5Qrcode(scannerId);

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText: string) => {
          try {
            // decodedText may be JSON payload or plain id_number
            let payload: any;
            try {
              payload = JSON.parse(decodedText);
            } catch {
              payload = { id_number: decodedText };
            }

            const idNumber = payload?.id_number;
            if (!idNumber) {
              console.warn('No id_number found in QR payload', payload);
              return;
            }

            const { data, error } = await supabase
              .from('members')
              .select('*')
              .eq('id_number', idNumber)
              .single();

            if (error) {
              console.error('Supabase lookup error:', error);
              // show modal with error message
              setModalMember({ error: error.message });
            } else if (!data) {
              setModalMember({ error: 'Member not found' });
            } else {
              // show member info in modal
              setModalMember(data);
            }

            // open modal and stop scanner after any result
            setModalOpen(true);
            await stopScanner();
          } catch (err) {
            console.error('scan callback error', err);
          }
        },
        (errorMessage: any) => {
          // scan failure callback (ignore or log)
        }
      );
    } catch (err) {
      console.error('startScanner error', err);
      setScanning(false);
    }
  }

  async function stopScanner() {
    try {
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch (e) {
      // ignore stop errors
    } finally {
      setScanning(false);
    }
  }

  // close modal (also ensure scanner stopped)
  function closeModal() {
    setModalOpen(false);
    setModalMember(null);
    stopScanner().catch(()=>{});
  }

  // close modal on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && modalOpen) closeModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Members</h1>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">{members.length} total</div>

          <button
            onClick={() => (scanning ? stopScanner() : startScanner())}
            className={`text-sm px-3 py-1 rounded ${scanning ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
            aria-label="Scan QR"
          >
            {scanning ? 'Stop Scan' : 'Scan QR'}
          </button>

          <button
            onClick={load}
            className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
            aria-label="Refresh members"
          >
            Refresh
          </button>
        </div>
      </div>

      <MemberForm onSaved={handleSaved} editing={editing} setEditing={setEditing} />

      {/* Scanner area */}
      {scanning && (
        <div className="mt-4 p-4 bg-white rounded shadow">
          <div id={scannerId} style={{ width: 340, height: 340 }} />
          <div className="mt-2 text-sm text-gray-600">Point your camera at a member QR code.</div>
        </div>
      )}

      {/* Modal popup for scanned or selected member */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <h3 className="text-lg font-semibold">
                  {modalMember?.full_name ?? 'Scan result'}
                </h3>
                {modalMember?.id_number && (
                  <div className="text-xs text-gray-500">ID: {modalMember.id_number}</div>
                )}
              </div>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-700 p-2 rounded"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-5 flex gap-4">
              {modalMember?.error ? (
                <div className="text-sm text-red-600">{modalMember.error}</div>
              ) : (
                <>
                  <div className="flex-shrink-0">
                    <div className="w-36 h-36 bg-gray-50 rounded flex items-center justify-center border">
                      <QRComponent member={modalMember} />
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Full name</div>
                      <div className="text-lg font-medium">{modalMember?.full_name}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">ID number</div>
                      <div className="text-sm text-gray-800">{modalMember?.id_number}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Mobile</div>
                      <div className="text-sm text-gray-800">{modalMember?.mobile ?? '-'}</div>
                    </div>

                    <div className="mt-4 flex gap-2">

                      <button
                        onClick={closeModal}
                        className="px-3 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 bg-white shadow rounded">
        <div className="px-4 py-3 sm:px-6 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">Members list</span>
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {!loading && members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No members yet.</td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.id_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{m.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.mobile}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(m)}
                          className="inline-flex items-center px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm rounded hover:bg-yellow-200"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteMember(m.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                        >
                          Delete
                        </button>

                        <button
                          onClick={() => {
                            // open modal for this member
                            setModalMember(m);
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-800 text-sm rounded hover:bg-blue-100"
                        >
                          Show QR
                        </button>
                      </div>

                      {showQrFor === m.id && (
                        <div className="mt-3">
                          <QRComponent member={m} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ...existing code...