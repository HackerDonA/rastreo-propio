import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { VistaCompartida } from './components/VistaCompartida.tsx';
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

createRoot(contenedor).render(
  <StrictMode>
    {compartido === null ? <App /> : <VistaCompartida token={compartido[1] ?? ''} />}
  </StrictMode>,
);
