# -*- coding: utf-8 -*-
"""
Genera los iconos de la aplicacion instalable (PWA).

POR QUE UN SCRIPT Y NO SUBIR LOS PNG A MANO
-------------------------------------------
Los iconos son un artefacto derivado: si manana cambia el color de marca hay
que rehacer seis archivos con el mismo recorte y el mismo margen. Un script los
regenera identicos en un segundo y deja escrito de donde salieron.

Los PNG resultantes SI se versionan, porque el build no debe depender de tener
Python instalado.

USO
---
    python scripts/generar-iconos.py

Requiere Pillow:  pip install Pillow
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

# Indigo 600 de Tailwind, el mismo acento que usa la interfaz.
FONDO = (79, 70, 229, 255)
TINTA = (255, 255, 255, 255)

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SALIDA = os.path.join(RAIZ, 'apps', 'web', 'public')

# Lienzo grande y luego reduccion: dibujar directo en 192 px deja los bordes
# dentados, porque Pillow no antialiasa el relleno de poligonos.
LIENZO = 1024


def dibujar_pin(d: ImageDraw.ImageDraw, cx: float, cy: float, alto: float) -> None:
    """Dibuja el pin de ubicacion: gota con un agujero circular."""
    ancho = alto * 0.72
    radio = ancho / 2.0
    centro_y = cy - alto / 2.0 + radio

    # Cabeza redonda.
    d.ellipse(
        [cx - radio, centro_y - radio, cx + radio, centro_y + radio],
        fill=TINTA,
    )
    # Punta triangular hacia abajo.
    d.polygon(
        [
            (cx - radio * 0.86, centro_y + radio * 0.52),
            (cx + radio * 0.86, centro_y + radio * 0.52),
            (cx, cy + alto / 2.0),
        ],
        fill=TINTA,
    )
    # Agujero: se recorta en el color de fondo para que se lea como un aro.
    hueco = radio * 0.40
    d.ellipse(
        [cx - hueco, centro_y - hueco, cx + hueco, centro_y + hueco],
        fill=FONDO,
    )


def lienzo(margen: float) -> Image.Image:
    """
    Crea el icono con el pin ocupando `1 - 2*margen` del lado.

    `margen` existe por los iconos `maskable` de Android, que el sistema recorta
    a la forma que quiera (circulo, cuadrado redondeado, gota). La zona segura
    es el 80% central: cualquier cosa fuera puede desaparecer.
    """
    img = Image.new('RGBA', (LIENZO, LIENZO), FONDO)
    d = ImageDraw.Draw(img)
    dibujar_pin(d, LIENZO / 2.0, LIENZO / 2.0, LIENZO * (1.0 - 2.0 * margen))
    return img


def redondear(img: Image.Image, radio_rel: float) -> Image.Image:
    """Aplica esquinas redondeadas. Solo para el icono de iOS."""
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [0, 0, img.size[0] - 1, img.size[1] - 1],
        radius=int(img.size[0] * radio_rel),
        fill=255,
    )
    salida = img.copy()
    salida.putalpha(mascara)
    return salida


def guardar(img: Image.Image, lado: int, nombre: str) -> None:
    ruta = os.path.join(SALIDA, nombre)
    img.resize((lado, lado), Image.LANCZOS).save(ruta, 'PNG', optimize=True)
    print('  %-28s %d x %d' % (nombre, lado, lado))


def main() -> None:
    if not os.path.isdir(SALIDA):
        os.makedirs(SALIDA)

    # Margen holgado: el icono normal tambien se ve mejor sin tocar los bordes.
    normal = lienzo(0.26)
    # Margen mayor: todo dentro de la zona segura del recorte de Android.
    seguro = lienzo(0.32)

    print('Generando iconos en apps/web/public/')
    guardar(normal, 192, 'icono-192.png')
    guardar(normal, 512, 'icono-512.png')
    guardar(seguro, 512, 'icono-maskable-512.png')
    # iOS ignora el manifest y no redondea por su cuenta en todas las
    # versiones, asi que este va con las esquinas ya recortadas.
    guardar(redondear(normal, 0.22), 180, 'apple-touch-icon.png')
    guardar(normal, 32, 'favicon-32.png')


if __name__ == '__main__':
    main()
