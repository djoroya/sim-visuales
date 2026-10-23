import assert from 'node:assert/strict';
import fs from 'node:fs';
import { creaClima, estadoInicial, derivadas, AJUSTES } from '../src/modelo/ges.js';
const clima = creaClima(JSON.parse(fs.readFileSync(new URL('../public/datos/tiempo-hortimed.json',import.meta.url))));
for(const hora of [0,6,12,18]) {
 const t=105*86400+hora*3600,y=estadoInicial(clima,t);y[16]=0.2;
 const f={},d=derivadas(t,y,clima,{...AJUSTES,added_CO2:5},f);
 assert.ok(Math.abs(f.carbono_inyeccion-f.co2_inyeccion*12/44)<1e-12);
 assert.ok(Math.abs(f.carbono_fotosintesis-f.co2_fotosintesis*12/44)<1e-12);
 const conversion=187.5*12/30;
 assert.ok(Math.abs(d[14]*conversion-(f.carbono_fotosintesis-f.carbono_fruto-f.carbono_hojas-f.carbono_tallo-f.carbono_resp_reserva))<1e-12);
 assert.ok(Math.abs(d[15]*conversion-(f.carbono_fruto-f.carbono_resp_fruto))<1e-12);
 assert.ok(Math.abs(d[16]*conversion-(f.carbono_hojas-f.carbono_resp_hojas-f.carbono_poda))<1e-12);
 assert.ok(Math.abs(d[17]*conversion-(f.carbono_tallo-f.carbono_resp_tallo))<1e-12);
 const total=d[13]*1000*12/44+(d[14]+d[15]+d[16]+d[17])*conversion;
 assert.ok(Math.abs(total-(f.carbono_inyeccion-f.carbono_ventilacion-f.carbono_poda))<1e-12);
}
console.log('OK: conservación del carbono entre aire, reserva, fruto, hojas, tallo, poda y exterior; conversión CO₂/CH₂O/C.');
