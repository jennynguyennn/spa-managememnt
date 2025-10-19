"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import QRComponent from '../components/QRComponent';
import MemberForm from '../components/MemberForm';
import { decryptString } from '../../lib/crypto';

export default function Dashboard() {
  const [members, setMembers] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showQrFor, setShowQrFor] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // searching
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);

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
    if (!confirm('Xóa khách hàng?')) return;
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

  // Find members by id / id_number / mobile
  async function findMembers() {
    const term = searchTerm.trim();
    if (!term) {
      await load();
      return;
    }

    setSearching(true);
    try {
      const expressions: string[] = [];
      // if term is an integer, include id equality
      if (/^\d+$/.test(term)) {
        expressions.push(`id.eq.${term}`);
      }
      // use ilike for partial matches on id_number and mobile
      const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
      expressions.push(`id_number.ilike.%${escaped}%`);
      expressions.push(`mobile.ilike.%${escaped}%`);
      const orQuery = expressions.join(',');

      const { data, error } = await supabase
        .from('members')
        .select('*')
        .or(orQuery)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('findMembers error', error);
        alert(error.message);
        setMembers([]);
      } else {
        setMembers(data || []);
      }
    } catch (err) {
      console.error('findMembers unexpected error', err);
      alert('Tìm thất bại');
    } finally {
      setSearching(false);
    }
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
            // Try to decrypt scanned payload first (if passphrase set), otherwise fall back
            let payloadText = decodedText;
            const passphrase = process.env.NEXT_PUBLIC_QR_PASSPHRASE ?? "";
            if (passphrase) {
              try {
                payloadText = await decryptString(decodedText, passphrase);
              } catch (e) {
                // decryption failed — payload remains as decodedText
              }
            }

            // payloadText may be JSON payload or plain id_number
            let payload: any;
            try {
              payload = JSON.parse(payloadText);
            } catch {
              payload = { id_number: payloadText };
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
              setModalMember({ error: 'Không tìm thấy khách hàng' });
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
        <h1 className="text-2xl font-semibold">Thẻ Thành Viên</h1>

        <div className="flex items-center gap-3">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') findMembers(); }}
            placeholder="Tìm theo ID / CCCD / Số điện thoại"
            className="px-3 py-1 rounded border text-sm"
            aria-label="Find member"
          />

          <button
            onClick={() => (searching ? null : findMembers())}
            className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            aria-label="Tìm"
            disabled={searching}
          >
            {searching ? 'Đang tìm…' : 'Tìm'}
          </button>

          <button
            onClick={() => { setSearchTerm(''); load(); }}
            className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-black"
            aria-label="Xóa tìm kiếm"
          >
            Xóa
          </button>

          <div className="text-sm text-gray-600">Tổng: {members.length}</div>

          <button
            onClick={() => (scanning ? stopScanner() : startScanner())}
            className={`text-sm px-3 py-1 rounded ${scanning ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
            aria-label="Quét QR"
          >
            {scanning ? 'Dừng quét' : 'Quét QR'}
          </button>

          <button
            onClick={load}
            className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-black"
            aria-label="Làm mới"
          >
            Làm mới
          </button>
        </div>
      </div>

      <MemberForm onSaved={handleSaved} editing={editing} setEditing={setEditing} />

      {/* Scanner area */}
      {scanning && (
        <div className="mt-4 p-4 bg-white rounded shadow">
          <div id={scannerId} style={{ width: 340, height: 340 }} />
          <div className="mt-2 text-sm text-gray-600">Hướng camera vào mã QR của khách hàng.</div>
        </div>
      )}

      {/* Modal popup for scanned or selected member */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          {/* increased modal max width so QR can be larger */}
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                   {modalMember?.full_name ?? 'Kết quả quét'}
                 </h3>
                 {modalMember?.id_number && (
                   <div className="text-xs text-gray-500">CCCD: {modalMember.id_number}</div>
                 )}
               </div>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-700 p-2 rounded"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            {/* larger QR area and ensure long text wraps/breaks */}
            <div className="p-5 flex flex-col sm:flex-row gap-4">
              {modalMember?.error ? (
                <div className="text-sm text-red-600">{modalMember.error}</div>
              ) : (
                <>
                  <div className="flex-shrink-0">
                    {/* make QR bigger */}
                    <div className="w-56 h-56 bg-gray-50 rounded flex items-center justify-center border">
                      <QRComponent member={modalMember} />
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Tên Khách Hàng</div>
                      <div className="text-lg font-medium">{modalMember?.full_name}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">CCCD</div>
                      {/* allow long id to wrap / break so it doesn't overflow */}
                      <div className="text-sm text-gray-800 break-all">{modalMember?.id_number}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Số Điện Thoại</div>
                      <div className="text-sm text-gray-800">{modalMember?.mobile ?? '-'}</div>
                    </div>

                    <div className="mt-4 flex gap-2">

                      <button
                        onClick={closeModal}
                        className="px-3 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 text-sm"
                      >
                        Đóng
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
          <span className="text-sm text-gray-600">Danh sách Khách Hàng</span>
          {loading && <span className="text-sm text-gray-500">Đang tải…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CCCD</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên Khách Hàng</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số Điện Thoại</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {!loading && members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">Chưa có khách hàng.</td>
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
                          Sửa
                        </button>

                        <button
                          onClick={() => deleteMember(m.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-red-600 text-black text-sm rounded hover:bg-red-700"
                        >
                          Xóa
                        </button>

                        <button
                          onClick={() => {
                            // open modal for this member
                            setModalMember(m);
                            setModalOpen(true);
                          }}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-800 text-sm rounded hover:bg-blue-100"
                        >
                          Hiển thị QR
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