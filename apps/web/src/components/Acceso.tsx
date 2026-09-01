/**
 * Pantalla de acceso.
 *
 * Aparece solo si la API tiene contraseña configurada. Sin ella, la aplicación
 * arranca directo — que es lo que pasa en desarrollo, con la API escuchando
 * únicamente en 127.0.0.1.
 */

import { useEffect, useRef, useState, type JSX } from 'react';

import { iniciarSesion } from '../lib/flota-api.ts';

export function Acceso({ onEntrar }: { readonly onEntrar: () => void }): JSX.Element {
  const [contrasena, setContrasena] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  const entrar = async (): Promise<void> => {
    if (contrasena === '') return;
    setEntrando(true);
    setError(null);
    try {
      await iniciarSesion(contrasena);
      onEntrar();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo entrar');
      setContrasena('');
      campoRef.current?.focus();
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="superficie flex h-dvh items-center justify-center p-6">
      <form
        className="tarjeta w-full max-w-sm p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
              <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-base leading-tight font-semibold">Rastreo</h1>
            <p className="texto-suave text-xs leading-tight">Monitoreo de flota</p>
          </div>
        </div>

        <label className="texto-suave mb-1 block text-xs font-medium" htmlFor="acc-pw">
          Contraseña
        </label>
        <input
          ref={campoRef}
          id="acc-pw"
          type="password"
          // Le dice al gestor de contraseñas del navegador que la guarde.
          autoComplete="current-password"
          value={contrasena}
          disabled={entrando}
          onChange={(e) => {
            setContrasena(e.target.value);
          }}
          className="borde panel mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
        />

        {error !== null && (
          <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={entrando || contrasena === ''}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="texto-suave mt-4 text-xs">
          ¿La olvidaste? Genera una nueva con{' '}
          <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
            pnpm hash-password
          </code>{' '}
          y pégala en tu archivo <code>.env</code>.
        </p>
      </form>
    </div>
  );
}
