import { StrictMode, useCallback, useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { Acceso } from './components/Acceso.tsx';
import { VistaCompartida } from './components/VistaCompartida.tsx';
import { estadoSesion } from './lib/flota-api.ts';
import './index.css';

const contenedor = document.getElementById('root');
if (contenedor === null) {
  throw new Error('No se encontró el elemento #root en index.html');
}

/**
 * Enrutado minimo por ruta.
 *
 * La aplicacion tiene exactamente DOS pantallas de nivel superior: la privada
 * y la vista publica de un enlace compartido. Traer react-router para eso
 * seria una dependencia entera al servicio de un `if`.
 *
 * La vista compartida se sirve en /c/<token>. Se comprueba el formato del
 * token aqui para que una URL malformada no dispare una peticion inutil.
 */
const RUTA_COMPARTIDA = new RegExp('^/c/([A-Za-z0-9_-]{20,64})/?$');
const compartido = RUTA_COMPARTIDA.exec(window.location.pathname);

/**
 * Decide entre la pantalla de acceso y la aplicacion.
 *
 * Se consulta al servidor en vez de guardar un indicador local: la sesion vive
 * en una cookie httpOnly que JavaScript no puede leer, y esa es justamente la
 * razon de que un XSS no pueda robarla.
 */
function Raiz(): JSX.Element | null {
  const [estado, setEstado] = useState<'consultando' | 'acceso' | 'listo' | 'sinApi'>(
    'consultando',
  );

  const comprobar = useCallback(() => {
    estadoSesion()
      .then((s) => {
        setEstado(!s.protegido || s.autenticado ? 'listo' : 'acceso');
      })
      .catch(() => {
        // La API no responde. Se deja pasar a la aplicacion, que ya tiene su
        // propia pantalla de error explicando que revisar.
        setEstado('sinApi');
      });
  }, []);

  useEffect(comprobar, [comprobar]);

  if (estado === 'consultando') return null;
  if (estado === 'acceso') return <Acceso onEntrar={comprobar} />;
  return <App />;
}

createRoot(contenedor).render(
  <StrictMode>
    {compartido === null ? <Raiz /> : <VistaCompartida token={compartido[1] ?? ''} />}
  </StrictMode>,
);
