'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Lang } from '@/lib/translations';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

export default function NewPlayerButton({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('P');

  const isKo = lang === 'ko';

  const close = () => {
    setOpen(false);
    setError('');
    setSuccess(false);
    setName('');
    setNumber('');
    setPosition('P');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(isKo ? '선수 이름을 입력해주세요.' : 'Player name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from('players').insert([
        {
          name: name.trim(),
          number: number ? parseInt(number) : null,
          position,
        },
      ]);
      if (insertError) throw insertError;
      setSuccess(true);
      setTimeout(() => {
        close();
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      setError(e?.message || (isKo ? '등록 중 오류가 발생했습니다.' : 'An error occurred.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          background: 'rgba(220,38,38,0.9)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        ＋ {isKo ? '신규 선수 등록' : 'Add Player'}
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 28,
              width: '100%',
              maxWidth: 420,
              boxShadow: 'var(--shadow)',
            }}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 18 }}>
                  ⚾ {isKo ? '신규 선수 등록' : 'Register New Player'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
                  {isKo ? 'Supabase players 테이블에 즉시 추가됩니다.' : 'Immediately added to the players table.'}
                </div>
              </div>
              <button
                onClick={close}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* 이름 */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 5, display: 'block', fontWeight: 500 }}>
                {isKo ? '선수 이름 *' : 'Player Name *'}
              </label>
              <input
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder={isKo ? '예: 홍길동' : 'e.g. John Doe'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {/* 등번호 + 포지션 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 5, display: 'block', fontWeight: 500 }}>
                  {isKo ? '등번호' : 'Number'}
                </label>
                <input
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  type="number"
                  placeholder="0"
                  min={0}
                  max={99}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </div>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 5, display: 'block', fontWeight: 500 }}>
                  {isKo ? '포지션' : 'Position'}
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    fontSize: 14,
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 안내 */}
            <div style={{
              background: 'rgba(96,165,250,0.08)',
              border: '1px solid rgba(96,165,250,0.2)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: '#60a5fa',
              marginBottom: 14,
            }}>
              💡 {isKo
                ? '타격/투수 기록은 /upload 또는 Supabase에서 시즌별로 별도 추가하세요.'
                : 'Add batting/pitching stats separately via /upload or Supabase.'}
            </div>

            {/* 에러 */}
            {error && (
              <div style={{ color: '#f87171', fontSize: 13, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, marginBottom: 14 }}>
                ⚠️ {error}
              </div>
            )}

            {/* 성공 */}
            {success && (
              <div style={{ color: '#4ade80', fontSize: 13, padding: '8px 12px', background: 'rgba(74,222,128,0.08)', borderRadius: 8, fontWeight: 600, marginBottom: 14 }}>
                ✓ {isKo ? '선수가 등록되었습니다! 새로고침 중...' : 'Player registered! Reloading...'}
              </div>
            )}

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={close}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {isKo ? '취소' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || success || !name.trim()}
                style={{
                  flex: 2,
                  padding: 10,
                  border: 'none',
                  borderRadius: 8,
                  background: name.trim() && !loading && !success ? '#DC2626' : 'rgba(100,116,139,0.4)',
                  color: '#fff',
                  cursor: name.trim() && !loading && !success ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {loading
                  ? (isKo ? '등록 중...' : 'Registering...')
                  : success
                  ? '✓'
                  : (isKo ? '선수 등록' : 'Register')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}