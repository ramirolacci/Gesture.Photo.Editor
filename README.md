# � Gesture Annotation

Herramienta de anotación en vivo para videollamadas, clases y presentaciones, controlada por gestos de manos usando MediaPipe Hands y Fabric.js.

## 🚀 Setup rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Iniciar servidor de desarrollo

```bash
npm run dev
```

### 3. Abrir en el navegador

Visitá http://localhost:5173

## 📖 Cómo usar

1. **Activar la cámara**: Hacé click en "Activar Cámara"
2. **Mostrá tus manos**: La app detectará automáticamente tus manos
3. **Usá gestos para anotar sobre la pantalla**:
   - 🤏 **Pinza** (pulgar + índice): Activar pincel
   - ☝️ **Señalar** (solo índice): Mover anotaciones
   - ✌️ **Paz** (índice + medio): Borrador
   - ✊ **Puño**: Zoom
   - 👍 **Pulgar arriba**: Confirmar o seguir

## 🛠️ Tecnologías

- **React 18** + TypeScript
- **Vite** (build tool)
- **Tailwind CSS** (estilos)
- **MediaPipe Hands** (detección de manos)
- **Fabric.js** (canvas de anotación)
- **Fingerpose** (reconocimiento de gestos)

## 📁 Estructura del proyecto
