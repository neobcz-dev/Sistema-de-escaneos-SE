/**
 * Extracción de datos de comprobantes paraguayos a partir del texto OCR.
 *
 * Los campos clave están regulados por la SET, por lo que tienen formatos
 * bastante estandarizados aunque el diseño del comprobante varíe:
 *  - RUC: número + dígito verificador  -> 80012345-6
 *  - N° de comprobante: establecimiento-punto-secuencia -> 001-001-0000123
 *  - Timbrado: 8 dígitos junto a la palabra "Timbrado"
 *
 * Para el RUC del proveedor usamos una heurística clave: como el cliente ya se
 * identificó con SU propio RUC, lo excluimos y nos quedamos con "el otro".
 */

export interface DatosDetectados {
  rucProveedor: string
  nroFactura: string
  timbrado: string
}

/** Deja solo los dígitos de un RUC/cédula para comparar. */
export function soloDigitos(texto: string): string {
  return (texto || '').replace(/\D/g, '')
}

// N° de comprobante: 3-3-(6 o 7). Muy distintivo y confiable.
const RE_NRO = /\b(\d{3}-\d{3}-\d{6,7})\b/g
// RUC / cédula con dígito verificador: 3 a 8 dígitos, guion, 1 dígito.
const RE_RUC = /\b(\d{3,8}-\d)\b/g
// Timbrado: la palabra seguida (con ruido de por medio) de 8 dígitos.
const RE_TIMBRADO = /timbrado\D{0,15}(\d{7,9})\b/i

/**
 * Analiza el texto OCR y devuelve los datos detectados.
 * @param texto     Texto plano del OCR.
 * @param rucCliente RUC del cliente (para excluirlo y aislar al proveedor).
 */
export function detectarDatos(texto: string, rucCliente: string): DatosDetectados {
  const t = texto || ''

  // 1) N° de comprobante (tomamos el primero con formato válido).
  const nros = Array.from(t.matchAll(RE_NRO)).map((m) => m[1])
  const nroFactura = nros[0] || ''

  // 2) Timbrado.
  const mTimb = t.match(RE_TIMBRADO)
  const timbrado = mTimb ? mTimb[1] : ''

  // 3) RUC del proveedor: candidatos, excluyendo el del cliente y los que en
  //    realidad son parte de un N° de comprobante (3-3-7).
  const clienteDigitos = soloDigitos(rucCliente)
  const nrosDigitos = new Set(nros.map(soloDigitos))

  const candidatos = Array.from(t.matchAll(RE_RUC))
    .map((m) => ({ valor: m[1], indice: m.index ?? 0 }))
    .filter((c) => {
      const d = soloDigitos(c.valor)
      if (d.length < 4) return false
      if (clienteDigitos && d === clienteDigitos) return false // es el cliente
      // Descartar si forma parte de un número de comprobante detectado.
      for (const nd of nrosDigitos) if (nd.includes(d)) return false
      return true
    })

  // Preferimos un candidato que esté cerca de la palabra "RUC".
  let rucProveedor = ''
  const posRuc = indicesDe(t.toLowerCase(), 'ruc')
  if (candidatos.length && posRuc.length) {
    let mejor = candidatos[0]
    let mejorDist = Infinity
    for (const c of candidatos) {
      for (const p of posRuc) {
        const dist = Math.abs(c.indice - p)
        if (dist < mejorDist) {
          mejorDist = dist
          mejor = c
        }
      }
    }
    rucProveedor = mejor.valor
  } else if (candidatos.length) {
    rucProveedor = candidatos[0].valor
  }

  return { rucProveedor, nroFactura, timbrado }
}

function indicesDe(hay: string, needle: string): number[] {
  const res: number[] = []
  let i = hay.indexOf(needle)
  while (i !== -1) {
    res.push(i)
    i = hay.indexOf(needle, i + needle.length)
  }
  return res
}
