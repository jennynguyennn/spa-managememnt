"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import QRComponent from '../components/QRComponent';
import MemberForm from '../components/MemberForm';
import { decryptString } from '../../lib/crypto';
import { useRouter } from 'next/navigation';

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
  // ref to measure scanner container for responsive sizing
  const scannerContainerRef = useRef<HTMLDivElement | null>(null);


  // modal state for showing member info (after scan or when user clicks Show QR)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMember, setModalMember] = useState<any | null>(null);
  // role state (admin/staff) — fetched on mount
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const router = useRouter();


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
   let mounted = true;
   // load members immediately and fetch role in parallel
   load(); // fire-and-forget

   (async () => {
     try {
       const { data: authData, error: authErr } = await supabase.auth.getUser();
       if (authErr) return console.error('auth.getUser', authErr);
       const user = (authData as any)?.user;
       if (!user) return;

       const { data: profile, error } = await supabase
         .from('profiles')
         .select('role')
         .eq('id', user.id)
         .single();

       if (!error && profile?.role && mounted) setRole(profile.role);
     } catch (e) {
       console.error('fetch profile role', e);
     }
   })();
   return () => { mounted = false; };
  }, []);

  async function deleteMember(id: number) {
    // client-side guard: only admin can delete
    if (role !== 'admin') {
      alert('Chỉ admin mới có quyền xóa.');
      return;
    }
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
        // smaller qrbox -> scanner will attempt to match a smaller overlay while the video feed
        // shows more area around it (wider view). Keep fps as before.
        { fps: 10, 
          qrbox: { width: 300, height: 300 }, 
        },
        async (decodedText: string) => {
          try {
            const passphrase = (process.env.NEXT_PUBLIC_QR_PASSPHRASE ?? "").trim();
            let raw = decodedText;

            // try decrypt if passphrase configured
            if (passphrase) {
              try {
                // decryptString should throw on bad input / wrong passphrase
                raw = await decryptString(decodedText, passphrase);
              } catch (e) {
                // decryption failed — fall back to raw decoded text
                console.warn('QR decrypt failed, using raw decoded text', e);
                raw = decodedText;
              }
            }

            // try parse JSON
            let payload: any;
            try {
              payload = JSON.parse(raw);
            } catch {
              // if not JSON, maybe it's urlencoded JSON or plain id_number
              try {
                payload = JSON.parse(decodeURIComponent(raw));
              } catch {
                payload = { id_number: raw };
              }
            }

            const idNumber = payload?.id_number;
            if (!idNumber) {
              // invalid QR payload — show user-friendly Vietnamese message
              setModalMember({ error: 'QR này không có trong hệ thống.' });
              setModalOpen(true);
              await stopScanner();
              return;
            }

            const { data, error } = await supabase
              .from('members')
              .select('*')
              .eq('id_number', idNumber)
              .maybeSingle();

            if (error) {
              console.error('Supabase lookup error:', error);
              setModalMember({ error: 'Không tìm thấy khách hàng.' });
            } else if (!data) {
              // QR decoded but not found in DB — inform user in Vietnamese
              setModalMember({ error: 'Khách hàng không tồn tại hoặc QR này không có trong hệ thống.' });
            } else {
              setModalMember(data);
            }

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

  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push('/login');
    } catch (err: any) {
      console.error('Logout error', err);
      alert('Logout failed: ' + (err?.message ?? String(err)));
    }
  }

  return (
    <div className="p-6">
      {/* Header: stacks on small screens */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Thẻ Thành Viên</h1>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') findMembers(); }}
              placeholder="Tìm theo ID / CCCD / Số điện thoại"
              className="px-3 py-1 rounded text-sm w-full sm:w-72"
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
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end ml-auto">
            <button
              onClick={() => { setSearchTerm(''); load(); }}
              className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-black"
              aria-label="Xóa tìm kiếm"
            >
              Xóa
            </button>

            <div className="text-sm text-gray-600 hidden sm:block">Tổng: {members.length}</div>

            <button
              onClick={() => (scanning ? stopScanner() : startScanner())}
              className={`text-sm px-3 py-1 rounded ${scanning ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
              aria-label="Quét QR"
            >
              {scanning ? 'Dừng quét' : 'Quét QR'}
            </button>

            <button
              onClick={load}
              className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
              aria-label="Refresh members"
            >
              Làm Mới
            </button>
            
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
              aria-label="Log out"
            >
              Đăng xuất
            </button>

            
          </div>
        </div>
      </div>

      <MemberForm onSaved={handleSaved} editing={editing} setEditing={setEditing} />

      {/* Scanner area */}
      {scanning && (
  <div className="mt-4 p-4 bg-white rounded shadow">
    {/* Responsive scanner container */}
    <div
      id={scannerId}
      className="relative w-full max-w-md aspect-square mx-auto overflow-hidden rounded-lg"
      style={{
        backgroundColor: '#000',
      }}
    />
    <div className="mt-2 text-sm text-gray-600 text-center">
      Hướng camera vào mã QR của khách hàng.
    </div>
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

            {/* modal content: stacks on mobile */}
            <div className="p-5 flex flex-col sm:flex-row gap-4">
              {modalMember?.error ? (
                <div className="text-sm text-red-600">{modalMember.error}</div>
              ) : (
                <>
                  <div className="flex-shrink-0">
                    {/* responsive QR size */}
                    <div className="w-44 h-44 sm:w-56 sm:h-56 bg-gray-50 rounded flex items-center justify-center border">
                      <QRComponent member={modalMember} />
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Tên Khách Hàng</div>
                      <div className="text-lg font-medium text-gray-600">{modalMember?.full_name}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">CCCD</div>
                      <div className="text-sm text-gray-800 break-all">{modalMember?.id_number}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Ngày cấp CCCD</div>
                      <div className="text-sm text-gray-800">
                        {modalMember?.id_card_created_date ? new Date(modalMember.id_card_created_date).toLocaleDateString() : '-'}
                      </div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Số Điện Thoại</div>
                      <div className="text-sm text-gray-800">{modalMember?.mobile ?? '-'}</div>
                    </div>

                    <div className="mb-2">
                      <div className="text-sm text-gray-600">Ghi Chú</div>
                      <div className="text-sm text-gray-800">{modalMember?.note ?? '-'}</div>
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

      {/* Mobile card list (visible on small screens) */}
      <div className="sm:hidden mt-4">
        <div className="space-y-3">
          {!loading && members.length === 0 ? (
            <div className="bg-white p-4 rounded text-center text-sm text-gray-500">Chưa có khách hàng.</div>
          ) : (
            members.map((m) => (
              <div key={m.id} className="bg-white shadow rounded p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{m.full_name}</div>
                    <div className="text-xs text-gray-500 break-all">{m.id_number}</div>
                    <div className="text-sm text-gray-700">{m.mobile}</div>
                    <div className="text-sm text-gray-500">
                      Ngày cấp: {m.id_card_created_date ? new Date(m.id_card_created_date).toLocaleDateString() : '-'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {role === 'admin' && (
                      <button
                        onClick={() => setEditing(m)}
                        className="inline-flex items-center px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm rounded hover:bg-yellow-200"
                      >
                        Chỉnh sửa
                      </button>
                    )}
                     <button
                       onClick={() => {
                         setModalMember(m);
                         setModalOpen(true);
                       }}
                       className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-800 text-sm rounded hover:bg-blue-100"
                     >
                       Hiển thị QR
                     </button>
 
                     {/* show delete only to admin */}
                     {role === 'admin' && (
                       <button
                         onClick={() => deleteMember(m.id)}
                         className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                       >
                         Xóa
                       </button>
                     )}
                   </div>
                </div>

                {showQrFor === m.id && (
                  <div className="mt-3 flex justify-center">
                    <QRComponent member={m} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Desktop table (hidden on small screens) */}
      <div className="hidden sm:block mt-6 bg-white shadow rounded">
        <div className="px-4 py-3 sm:px-6 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">Danh sách Khách Hàng</span>
          {loading && <span className="text-sm text-gray-500">Đang tải…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CCCD</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày cấp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên Khách Hàng</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số Điện Thoại</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {!loading && members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">Chưa có khách hàng.</td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.id_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {m.id_card_created_date ? new Date(m.id_card_created_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{m.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{m.mobile}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center justify-end gap-2">
                        {role === 'admin' && (
                          <button
                            onClick={() => setEditing(m)}
                            className="inline-flex items-center px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm rounded hover:bg-yellow-200"
                          >
                            Chỉnh sửa
                          </button>
                        )}
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
 
                        {/* show delete only to admin */}
                        {role === 'admin' && (
                          <button
                             onClick={() => deleteMember(m.id)}
                             className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                        >
                            Xóa
                          </button>
                        )}
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