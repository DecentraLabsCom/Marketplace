/**
 * Script para generar par de claves RSA para firma JWT
 * Equivalente a:
 * openssl genrsa -out marketplace-private-key.pem 2048
 * openssl rsa -in marketplace-private-key.pem -pubout -out marketplace-public-key.pem
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const generateRSAKeyPair = () => {
  console.log('🔑 Generando par de claves RSA para JWT...');
  
  // Generar par de claves RSA
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Crear directorio si no existe
  const certsDir = path.join(__dirname, '..', 'certificates', 'jwt');
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  // Guardar claves
  const privateKeyPath = path.join(certsDir, 'marketplace-private-key.pem');
  const publicKeyPath = path.join(certsDir, 'marketplace-public-key.pem');

  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  console.log('✅ Claves generadas exitosamente:');
  console.log(`📄 Clave privada: ${privateKeyPath}`);
  console.log(`📄 Clave pública: ${publicKeyPath}`);
  
  console.log('\n🔒 IMPORTANTE:');
  console.log('- La clave privada debe mantenerse SEGURA y NUNCA debe ser expuesta');
  console.log('- La clave pública se servirá a través del endpoint /.well-known/public-key.pem');
  console.log('- Añadir certificates/jwt/ al .gitignore para evitar que se suban las claves');

  // Mostrar las primeras líneas de cada clave para verificación
  console.log('\n📋 Vista previa de la clave pública:');
  console.log(publicKey.split('\n').slice(0, 3).join('\n') + '\n[...]');
};

// Ejecutar generación
try {
  generateRSAKeyPair();
} catch (error) {
  console.error('❌ Error generando claves:', error.message);
  process.exit(1);
}