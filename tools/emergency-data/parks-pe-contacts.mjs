/**
 * Oficina y teléfono de la jefatura de cada área natural protegida de Perú, del
 * «Directorio de jefes de áreas naturales protegidas» del SERNANP (junio de 2024,
 * investigacionesanp.sernanp.gob.pe, documento público de una entidad del Estado).
 * Solo oficina y teléfono: no se cargan los nombres ni los correos de los jefes.
 * Varias áreas comparten oficina; muchas no tienen teléfono fijo publicado.
 *
 * Cada fila: [texto del nombre del área (sin tildes, minúsculas), dirección, teléfono].
 * El teléfono va como lo marcaría un celular: +51, código de la ciudad sin el 0.
 *
 * Revisión del 2026-11-16: un directorio más nuevo (setiembre de 2026, gob.pe) trae un teléfono nuevo (RN San Fernando, ya cargado) y ya no
 * lista 8 de los de junio de 2024 (Pantanos de Villa, Nor Yauyos-Cochas, Chacamarca, Manglares de Tumbes, Tambopata, Ampay, Megantoni y
 * Machiguenga): se dejan hasta confirmarlos, pero pueden estar desactualizados. Algunos teléfonos están compartidos por varias áreas.
 */
const LIMA_CHICLAYO = 'Calle Los Laureles 330, Urb. Felipe Santiago Salaverry, Chiclayo';
const IQUITOS = 'Calle Tacna 432, Iquitos';
const TUMBES = 'Av. Panamericana Norte 1739, Tumbes';
const UCAYALI = 'Av. Túpac Amaru 749 Mz G Lt 10, Yarinacocha, Ucayali';
const PUNO = 'Pasaje 2 de Febrero 154, Barrio Huajsapata, Puno';
const PIURA = 'Calle Los Cocos H-23, Urb. Club Grau, Piura';
const HUANCAYO = 'Av. Huancavelica 3113, Urb. Covica, El Tambo, Huancayo';
const MALDONADO = 'Jr. Cajamarca 946, Puerto Maldonado';
const QUILLABAMBA = 'Jr. Sabas Sarazola K-17, Quillabamba, Cusco';
const SATIPO = 'Carretera Marginal Km 1.5 Satipo–Río Negro, Satipo';
const NIEVA = 'Mz S1 Lt 1, Barrio Vista Alegre, Santa María de Nieva, Amazonas';
const SOPLIN = 'Calle 28 de Julio s/n, Soplín Vargas, Putumayo, Loreto';
const SANMARTIN = 'Av. Antonio Raymondi Mz A Lt 3-5, San Ramón, Junín';
const PARACAS = 'Carretera Punta Pejerrey Km 27, Paracas, Pisco';
const JUNIN = 'Jr. San Martín 138, Junín';
const CHAO = 'Pasaje Simón Bolívar Mz 25 Lt 20B, Chao, Virú, La Libertad';

export const PARK_CONTACTS = [
  ['parque nacional de cutervo', 'Av. San Juan 724, Cutervo, Cajamarca', '+51 76 437457'],
  ['parque nacional de tingo maria', 'Jr. Elías Mabama 290, Tingo María, Huánuco', '+51 62 563559'],
  ['parque nacional del manu', 'Urb. Santa Martha E-12, Aproviles, San Jerónimo, Cusco', '+51 84 274509'],
  ['parque nacional huascaran', 'Jr. Federico Sal y Rosas 555, Huaraz', '+51 43 422086'],
  ['parque nacional cerros de amotape', TUMBES, '+51 72 526489'],
  ['parque nacional del rio abiseo', 'Jr. Leticia 1477, Juanjuí, San Martín', '+51 42 545781'],
  ['parque nacional yanachaga', 'Prolongación Pozuzo 156, Oxapampa, Pasco', '+51 63 462544'],
  ['parque nacional bahuaja-sonene', 'Pasaje 2 de Febrero 154 piso 3, Puno', '+51 51 363960'],
  ['parque nacional cordillera azul', 'Jr. Ángel Delgado Morey 565, Tarapoto', '+51 42 529844'],
  ['parque nacional otishi', SATIPO, '+51 64 545598'],
  ['parque nacional alto purus', UCAYALI, '+51 61 441734'],
  ['parque nacional sierra del divisor', UCAYALI, '+51 61 441734'],
  ['parque nacional ichigkat muja', NIEVA, ''],
  ['parque nacional gueppi', SOPLIN, ''],
  ['parque nacional yaguas', IQUITOS, ''],
  ['santuario nacional de huayllay', 'Av. Ernesto Souza s/n, Canchacucho, Huayllay, Pasco', ''],
  ['santuario nacional de calipuy', 'Calle Miguel Grau 1839, Santiago de Chuco, La Libertad', ''],
  ['santuario nacional lagunas de mejia', 'Km 32.4 Panamericana Sur, Mejía, Islay, Arequipa', ''],
  ['santuario nacional de ampay', 'Urb. Santa Martha Mz M Lt 2, Abancay', '+51 83 322233'],
  ['santuario nacional los manglares de tumbes', TUMBES, '+51 72 280475'],
  ['santuario nacional megantoni', QUILLABAMBA, '+51 84 281961'],
  ['santuario nacional pampa hermosa', SANMARTIN, ''],
  ['santuario nacional tabaconas', 'Jr. José Olaya 680, San Ignacio, Cajamarca', ''],
  ['santuario nacional cordillera de colan', 'Jr. Ciro Alegría 788, Bagua Grande, Amazonas', ''],
  ['santuario historico de chacamarca', JUNIN, '+51 64 344146'],
  ['santuario historico de la pampa de ayacucho', 'Pucarumi, Quinua, Huamanga, Ayacucho', ''],
  ['santuario historico machupicchu', 'Av. Oswaldo Baca 402, Urb. Magisterial, Cusco', '+51 84 229297'],
  ['santuario historico bosque de pomac', LIMA_CHICLAYO, '+51 74 206466'],
  ['reserva nacional pampa galeras', 'Av. Circunvalación s/n, Nazca, Ica', ''],
  ['reserva nacional de junin', JUNIN, '+51 64 344146'],
  ['reserva nacional de paracas', PARACAS, ''],
  ['reserva nacional de lachay', 'Panamericana Norte km 105, Huacho, Lima', ''],
  ['reserva nacional del titicaca', PUNO, '+51 51 368559'],
  ['reserva nacional de salinas y aguada blanca', 'Coop. Los Independientes A-4, Umacollo, Yanahuara, Arequipa', '+51 54 257461'],
  ['reserva nacional de calipuy', CHAO, ''],
  ['reserva nacional pacaya-samiria', IQUITOS, ''],
  ['reserva nacional tambopata', MALDONADO, '+51 82 571247'],
  ['reserva nacional allpahuayo mishana', IQUITOS, ''],
  ['reserva nacional de tumbes', TUMBES, '+51 72 526489'],
  ['reserva nacional matses', IQUITOS, ''],
  ['reserva nacional sistema de islas', 'José Gálvez Barrenechea 696, San Isidro, Lima', ''],
  ['reserva nacional pucacuro', IQUITOS, ''],
  ['reserva nacional san fernando', 'Av. Agustín Bocanegra y Prada 829, Nasca, Ica', '+51 56 640216'], // directorio de jefes de setiembre de 2026 (gob.pe, 25/09/2026)
  ['reserva nacional dorsal de nasca', PARACAS, ''],
  ['reserva nacional illescas', PIURA, '+51 73 321668'],
  ['reserva nacional mar tropical de grau', PIURA, '+51 73 321668'],
  ['refugio de vida silvestre laquipampa', LIMA_CHICLAYO, '+51 74 206466'],
  ['refugio de vida silvestre los pantanos de villa', 'Jr. Alameda de Don Emilio Mz X Lt 10, Chorrillos, Lima', '+51 1 2548887'],
  ['refugio de vida silvestre bosques nublados de udima', LIMA_CHICLAYO, '+51 74 206466'],
  ['reserva paisajistica nor yauyos', HUANCAYO, '+51 64 243888'],
  ['reserva paisajistica subcuenca del cotahuasi', 'Urb. Pampas de Aymaña Mz F Lt 12, Cotahuasi, Arequipa', ''],
  ['reserva comunal yanesha', 'Av. Herminio Schuler cdra. 3 s/n, Palcazú, Oxapampa, Pasco', ''],
  ['reserva comunal el sira', UCAYALI, '+51 61 441734'],
  ['reserva comunal amarakaeri', MALDONADO, '+51 82 571505'],
  ['reserva comunal ashaninka', 'Urb. El Milagro 292, Carretera Marginal Km 1.5, Satipo', '+51 64 546425'],
  ['reserva comunal machiguenga', QUILLABAMBA, '+51 84 282345'],
  ['reserva comunal purus', 'Av. Luis Muñoz Nadal s/n, Puerto Esperanza, Ucayali', ''],
  ['reserva comunal tuntanain', NIEVA, ''],
  ['reserva comunal chayu nain', 'Calle Awajun s/n, Los Aguajales, Imaza, Bagua, Amazonas', ''],
  ['reserva comunal airo pai', SOPLIN, ''],
  ['reserva comunal huimeki', SOPLIN, ''],
  ['bosque de proteccion de pui pui', SANMARTIN, ''],
  ['bosque de proteccion san matias', 'Av. Marginal Lt 18 Mz A, Urb. Las Palmeras, Pichanaki, Junín', ''],
  ['bosque de proteccion alto mayo', 'Carretera entrada a Pósic s/n, Rioja, San Martín', '+51 42 558467'],
  ['bosque de proteccion de pagaibamba', LIMA_CHICLAYO, '+51 74 206466'],
  ['bosque de proteccion puquio santa rosa', CHAO, ''],
  ['bosque de proteccion aledano a la bocatoma', HUANCAYO, '+51 64 243888'],
  ['bosque de proteccion tijae', 'Jr. Ciro Alegría 788, Bagua Grande, Amazonas', ''],
  ['reserva comunal bajo putumayo', IQUITOS, ''],
  ['coto de caza el angolo', PIURA, '+51 73 321668'],
  ['coto de caza sunchubamba', LIMA_CHICLAYO, '+51 74 206466'],
];

/** Sin tildes y en minúsculas, para comparar nombres. */
export const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function contactFor(name) {
  const n = plain(name);
  return PARK_CONTACTS.find(([key]) => n.includes(key)) ?? null;
}
