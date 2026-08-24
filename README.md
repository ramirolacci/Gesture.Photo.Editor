<div align="center">

# 🖐🏻 Gesture Photo Editor & Live Canvas

**Editor interactivo de fotos y lienzo de anotación en tiempo real controlado por gestos de manos sin contacto.**

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-orange?style=for-the-badge&logo=google)](https://developers.google.com/mediapipe)
[![Fabric.js](https://img.shields.io/badge/Fabric.js-Canvas-red?style=for-the-badge)](https://fabricjs.com/)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

</div>

## 🌟 Descripción General

**Gesture Photo Editor** es una aplicación web moderna diseñada para presentaciones, videollamadas, clases virtuales y edición interactiva de imágenes. Permite dibujar, realizar anotaciones, insertar formas geométricas y manipular elementos visuales directamente sobre la pantalla mediante **reconocimiento de gestos manuales en tiempo real**, eliminando la necesidad de interactuar con el ratón o teclado.

---

## ✨ Características Principales

* 🖐🏻 **Control por Gestos en Tiempo Real**: Detección fluida y precisa de la mano mediante visión artificial con MediaPipe Hands.
* ✏️ **Herramientas de Anotación Versátiles**:
  * **Pincel Libre**: Dibujo dinámico con color y grosor personalizable.
  * **Puntero Láser**: Trazo fosforescente con desvanecimiento automático para presentaciones.
  * **Borrador Vectorial**: Eliminación intuitiva y limpia de anotaciones.
  * **Agarrar y Arrastrar (Move)**: Selección y reposicionamiento de elementos en el lienzo.
  * **Formas Geométricas**: Inserción rápida de círculos, rectángulos y líneas de subrayado.
* 🎨 **Interfaz Futurista y Minimalista**: Menú flotante ultra-limpio en modo oscuro (*Dark Glassmorphism*) con cursor virtual interactivo.
* 🔊 **Feedback Auditivo**: Efectos de sonido integrados mediante Web Audio API para una experiencia inmersiva.
* ↩️ **Historial Completo (Undo / Redo)**: Control total del flujo de trabajo con gestos o accesos directos.
* 📸 **Exportación en Alta Resolución**: Descarga instantánea de las creaciones en formato PNG.

---

## 🖐🏻 Guía de Gestos Manuales

| Gesto | Nombre | Acción en la Aplicación |
| :---: | :--- | :--- |
| ☝🏻 | **Solo Índice** | Mueve el puntero interactivo por la pantalla. |
| 🤏🏻 | **Pinch (Pulgar + Índice)** | **Dibujar / Agarrar**: Traza líneas en espacio libre o arrastra objetos seleccionados. |
| ✌🏻 | **Peace (Índice + Medio)** | Activa el **Borrador Vectorial** rápido. |
| 🖐🏻| **Palma Abierta** | Alterna **Pausa / Reanudación** de la lectura de gestos. |
| ✌🏻✌🏻 | **Doble Peace (Dos manos)** | Abre / Cierra el menú rápido de ajustes del lienzo. |

---

## 🛠️ Tecnologías Utilizadas

* **Frontend**: React 18 & TypeScript
* **Visión Artificial**: Google MediaPipe Hands & Fingerpose
* **Motor de Canvas**: Fabric.js
* **Estilos & UI**: Tailwind CSS & Glassmorphism UI
* **Audio**: Web Audio API (Synthesizer de efectos)

