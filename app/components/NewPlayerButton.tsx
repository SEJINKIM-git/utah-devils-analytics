'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Lang } from '@/lib/translations';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

interface Props {
  lang: Lang;
}

interface FormState {
  name: string;
  number: string;
  position: string;
}

export default function NewPlayerButton({ lang }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: '',
    number: '',
    position: 'P',
  });

  const isKo = lang === 'ko';

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError(isKo ? '선수 이름을 입력해주세요.' : 'Player name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from('players').insert([
        {
          name: form.name.trim(),
          number: form.number ? parseInt(form.number) : null,
          position: form.position,
        },
      ]);
      if (insertError) throw insertError;
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setForm({ name: '', number: '', position: 'P' });
        // 페이지 새로고침으로 새 선수 반영
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      setError(e?.message || (isKo ? '등록 중 오류가 발생했습니다.' : 'An error occurred.'));
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: 12,
    marginBottom: 5,
    display: 'block',
    fontWeight: 500,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    background: 'var(--input-bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <>
      {/* 버튼 */}
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
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#DC2626')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.9)')}
      >
        ＋ {isKo ? '신규 선수 등록' : 'Add Player'}
      </button>

      {/* 모달 오버레이 */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
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
                onClick={() => { setOpen(false); setError(''); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* 폼 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 이름 */}
              <div>
                <label style={labelStyle}>{isKo ? '선수 이름 *' : 'Player Name *'}</label>
                <input
                  style={inputStyle}
                  placeholder={isKo ? '예: 홍길동' : 'e.g. John Doe'}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {/* 등번호 + 포지션 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>{isKo ? '등번호' : 'Number'}</label>
                  <input
                    style={inputStyle}
                    type="number"
                    placeholder="0"
                    min={0}
                    max={99}
                    value={form.number}
                    onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{isKo ? '포지션' : 'Position'}</label>
                  <select
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    value={form.position}
                    onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  >
                    {POSITIONS.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 안내 메시지 */}
              <div style={{
                background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96,165,250,0.2)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: '#60a5fa',
              }}>
                💡 {isKo
                  ? '타격/투수 기록은 /upload 또는 Supabase에서 시즌별로 별도 추가하세요.'
                  : 'Add batting/pitching stats separately via /upload or Supabase.'}
              </div>

              {/* 에러 */}
              {error && (
                <div style={{ color: '#f87171', fontSize: 13, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
                  ⚠️ {error}
                </div>
              )}

              {/* 성공 */}
              {success && (
                <div style={{ color: '#4ade80', fontSize: 13, padding: '8px 12px', background: 'rgba(74,222,128,0.08)', borderRadius: 8, fontWeight: 600 }}>
                  ✓ {isKo ? '선수가 등록되었습니다! 새로고침 중...' : 'Player registered! Reloading...'}
                </div>
              )}
            </div>

            {/* 버튼 영역 */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => { setOpen(false); setError(''); }}
                style={{
                  flex: 1,
                  padding: '10px',
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
                disabled={loading || success || !form.name.trim()}
                style={{
                  flex: 2,
                  padding: '10px',
                  border: 'none',
                  borderRadius: 8,
                  background: form.name.trim() && !loading && !success
                    ? '#DC2626'
                    : 'rgba(100,116,139,0.4)',
                  color: '#fff',
                  cursor: form.name.trim() && !loading && !success ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 14,
                  transition: 'background 0.15s',
                }}
              >
                {loading
                  ? (isKo ? '등록 중...' : 'Registering...')
                  : success
                  ? '✓'
                  : isKo ? '선수 등록' : 'Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}