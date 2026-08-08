/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BitgetBroker } from './execution/brokers/bitget-broker.ts';

/**
 * Script de prueba rápida para validación de API de Bitget y diagnóstico de conexión.
 * 
 * Este script se encarga de:
 * 1. Instanciar la clase de producción `BitgetBroker`.
 * 2. Cargar y verificar la presencia de variables de entorno (API Key, Secret, Passphrase).
 * 3. Ejecutar de forma segura una petición asíncrona a `getBalance('USDT')`.
 * 4. Capturar e imprimir con máximo nivel de detalle el balance retornado o los errores
 *    de autenticación, firma, timestamping o red que impidan la conexión.
 * 
 * Puede ser ejecutado de forma aislada mediante:
 * npx tsx src/test-bitget.ts
 */
async function ejecutarPruebaConexionBitget() {
  console.log('================================================================');
  console.log('  DIAGNÓSTICO DE CONEXIÓN INSTITUCIONAL Y CREDENCIALES: BITGET   ');
  console.log('================================================================\n');

  // 1. Auditoría preliminar de variables de entorno
  const api_key = process.env.BITGET_API_KEY;
  const api_secret = process.env.BITGET_API_SECRET;
  const passphrase = process.env.BITGET_PASSPHRASE;

  console.log('>> Inspeccionando variables de entorno...');
  console.log(`- BITGET_API_KEY: ${api_key ? 'CONFIGURADO [✓]' : 'NO DETECTADO [✗]'}`);
  console.log(`- BITGET_API_SECRET: ${api_secret ? 'CONFIGURADO [✓]' : 'NO DETECTADO [✗]'}`);
  console.log(`- BITGET_PASSPHRASE: ${passphrase ? 'CONFIGURADO [✓]' : 'NO DETECTADO [✗]'}\n`);

  if (!api_key || !api_secret || !passphrase) {
    console.warn('[ALERTA] Faltan una o más variables de entorno de Bitget.');
    console.warn('El broker operará automáticamente en modo de simulación o fallback local.\n');
  } else {
    // Enmascarar la API Key para la impresión segura en bitácora
    const keyEnmascarada = `${api_key.substring(0, 4)}...${api_key.substring(api_key.length - 4)}`;
    console.log(`[Seguridad] API Key detectada para pruebas: ${keyEnmascarada}\n`);
  }

  // 2. Instanciación del Broker
  const broker = new BitgetBroker();

  try {
    console.log('>> Conectando con la API de Bitget Perpetuales...');
    console.log('>> Enviando llamada asíncrona a getBalance("USDT")...');
    
    const inicioTimestamp = Date.now();
    const balanceUSDT = await broker.getBalance('USDT');
    const latencia = Date.now() - inicioTimestamp;

    console.log('\n================================================================');
    console.log('       [RESULTADO DE CONEXIÓN: ÉXITO ROTUNDO / CONECTADO]       ');
    console.log('================================================================');
    console.log(`- Activo Consultado: USDT`);
    console.log(`- Balance Disponible: $${balanceUSDT.toLocaleString()} USDT`);
    console.log(`- Latencia de Respuesta: ${latencia}ms`);
    console.log('================================================================\n');

  } catch (error: any) {
    console.error('\n================================================================');
    console.error('      [FALLA CRÍTICA DE AUTENTICACIÓN / CONEXIÓN DE RED]        ');
    console.error('================================================================');
    console.error('La llamada a Bitget ha fallado. Detalles técnicos del error:');
    console.error(`- Mensaje de Error: ${error?.message || error}`);
    
    // Inspección de causas comunes
    if (error?.message?.includes('401') || error?.message?.toLowerCase().includes('sign') || error?.message?.toLowerCase().includes('apikey')) {
      console.error('- Causa sugerida: Clave de API incorrecta o firma de mensaje inválida.');
    } else if (error?.message?.toLowerCase().includes('passphrase') || error?.message?.toLowerCase().includes('password')) {
      console.error('- Causa sugerida: El passphrase de la API de Bitget no coincide.');
    } else if (error?.message?.toLowerCase().includes('timestamp') || error?.message?.toLowerCase().includes('time')) {
      console.error('- Causa sugerida: Desincronización horaria (drift) con los servidores de Bitget.');
    } else {
      console.error('- Causa sugerida: Problema temporal de red, IP bloqueada/no autorizada por whitelist de Bitget o timeouts.');
    }
    console.error('================================================================\n');
  }
}

// Arrancar diagnóstico
ejecutarPruebaConexionBitget();
