import type { KitType } from '@/core/model/types';
import type { L } from './guides/types';

/**
 * Plantillas para armar botiquines: qué llevar según el escenario y el nivel, con cantidades por persona y por día. NO hay dosis: los
 * medicamentos figuran solo como categoría («analgésico», «antihistamínico») y siempre con «consultá a tu médico o farmacéutico».
 *
 * Fuentes (paráfrasis propia, sin copiar textos; ver docs/FUENTES-DE-DATOS.md):
 * - Categorías del JFAK/IFAK del Departamento de Defensa de EE. UU. (curso Combat Lifesaver, notas TCCC-CLS 2020 y 2025) y guías TCCC 2026
 *   del Committee on TCCC / Joint Trauma System (obra del gobierno de EE. UU.).
 * - Ministerio de Salud de la Nación (Argentina), «Manual de Primeros Auxilios y Prevención de Lesiones» (2016) y guías de envenenamiento por
 *   ofidios (2014), escorpiones (2011) y arañas (2012): reproducibles citando la fuente.
 * - Cruz Roja Americana («Anatomy of a first aid kit»), folleto de ISEA sobre ANSI/ISEA Z308.1-2021, SINAE (Uruguay), SENAPRED (Chile) y
 *   MINSA (Perú).
 * «IFAK» y «JFAK» son kits del Departamento de Defensa; «AFAK» y «MFAK» son nombres comerciales sin definición oficial: acá no se usan.
 */

export const LEVELS = ['individual', 'advanced', 'group'] as const;
export type Level = (typeof LEVELS)[number];

const l = (es: string, en: string): L => ({ es, en });

export const GROUPS = ['bleeding', 'airway', 'chest', 'wounds', 'bones', 'burns', 'cold', 'protection', 'tools', 'meds', 'docs'] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_NAMES: Record<Group, L> = {
  bleeding: l('Hemorragia grave', 'Severe bleeding'),
  airway: l('Vía aérea y respiración', 'Airway and breathing'),
  chest: l('Tórax', 'Chest'),
  wounds: l('Heridas y curaciones', 'Wounds and dressings'),
  bones: l('Huesos y articulaciones', 'Bones and joints'),
  burns: l('Quemaduras', 'Burns'),
  cold: l('Frío y calor', 'Cold and heat'),
  protection: l('Protección personal', 'Personal protection'),
  tools: l('Herramientas e instrumentos', 'Tools and instruments'),
  meds: l('Medicación (solo categorías, sin dosis)', 'Medication (categories only, no doses)'),
  docs: l('Datos y registro', 'Information and records'),
};

export interface CatalogItem {
  name: L;
  /** Cómo se cuenta (por defecto «unidades»). */
  unit?: L;
  group: Group;
  /** Para qué sirve, en una línea. */
  note: L;
  /** Solo lo debe usar personal entrenado: se marca y queda en el nivel Avanzado. */
  trained?: boolean;
  /** Es medicación: se pide consultar al médico o farmacéutico y se recuerda cargar el vencimiento. */
  medication?: boolean;
  /** Tiene fecha de vencimiento que conviene cargar. */
  expires?: boolean;
  /** Aviso extra (por ejemplo, posturas distintas entre fuentes). */
  caution?: L;
}

const PAIRS = l('pares', 'pairs');
const PACKS = l('sobres', 'sachets');
const BLISTERS = l('tiras o blísteres', 'strips or blister packs');
const ROLLS = l('rollos', 'rolls');

export const CATALOG: Record<string, CatalogItem> = {
  tourniquet: {
    name: l('Torniquete de molinete (tipo CAT)', 'Windlass tourniquet (CAT type)'),
    group: 'bleeding',
    note: l('Para un sangrado grave de brazo o pierna que no para apretando. Se coloca 5 a 7 cm por encima de la herida. Practicá antes de necesitarlo.', 'For severe arm or leg bleeding that does not stop with pressure. Place it 5 to 7 cm above the wound. Practice before you need it.'),
    caution: l(
      'Las fuentes difieren: el Manual de Primeros Auxilios del Ministerio de Salud de la Nación (2016) aconseja no usar torniquete en heridas comunes; las guías TCCC 2026 y TECC 2024 lo recomiendan cuando una hemorragia grave de miembro no cede con presión directa. En la guía de la app: primero presión; torniquete solo si sigue saliendo en chorro.',
      'Sources differ: the Argentine Ministry of Health first-aid manual (2016) advises against tourniquets for ordinary wounds; TCCC 2026 and TECC 2024 recommend them when severe limb bleeding does not respond to direct pressure. In the app guide: pressure first; tourniquet only if it keeps spurting.',
    ),
  },
  hemostatic: { name: l('Gasa hemostática', 'Hemostatic gauze'), group: 'bleeding', expires: true, note: l('Para heridas donde no va torniquete (ingle, axila, cuello) o si la presión no alcanza: se empaqueta la herida y se aprieta al menos 3 minutos.', 'For wounds where a tourniquet does not fit (groin, armpit, neck) or pressure is not enough: pack the wound and press at least 3 minutes.') },
  pressure_bandage: { name: l('Vendaje de emergencia / vendaje israelí', 'Emergency pressure bandage (Israeli bandage)'), group: 'bleeding', note: l('Vendaje elástico con almohadilla que hace presión sobre la herida.', 'Elastic bandage with a pad that presses on the wound.') },
  trauma_dressing: { name: l('Apósito de trauma grande', 'Large trauma dressing'), group: 'bleeding', note: l('Cubre heridas grandes y absorbe mucha sangre.', 'Covers large wounds and absorbs a lot of blood.') },
  gauze_roll: { name: l('Gasa en rollo', 'Rolled gauze'), unit: ROLLS, group: 'bleeding', note: l('Para empaquetar una herida profunda y sostener apósitos.', 'To pack a deep wound and hold dressings.') },

  cpr_mask: { name: l('Barrera para respiración (RCP)', 'CPR barrier mask'), group: 'airway', note: l('Protege a quien hace respiración boca a boca.', 'Protects the person giving rescue breaths.') },
  npa: { name: l('Cánula nasofaríngea con lubricante', 'Nasopharyngeal airway with lubricant'), group: 'airway', trained: true, note: l('Ayuda a mantener abierta la vía aérea de una persona inconsciente. Solo personal entrenado.', 'Helps keep the airway of an unconscious person open. Trained personnel only.') },

  chest_seal: { name: l('Sello torácico ventilado', 'Vented chest seal'), unit: PAIRS, group: 'chest', note: l('Tapa una herida del pecho que «sopla» aire, dejando salir el aire acumulado.', 'Covers a chest wound that «sucks» air, letting trapped air escape.') },
  needle: { name: l('Aguja de descompresión torácica', 'Chest decompression needle'), group: 'chest', trained: true, note: l('Alivia una acumulación peligrosa de aire en el pecho. Solo personal médico o entrenado.', 'Relieves a dangerous build-up of air in the chest. Medical or trained personnel only.') },

  sterile_gauze: { name: l('Gasas estériles', 'Sterile gauze pads'), group: 'wounds', expires: true, note: l('Para limpiar, cubrir y apretar heridas.', 'To clean, cover and press wounds.') },
  sterile_dressing: { name: l('Apósitos estériles', 'Sterile dressings'), group: 'wounds', expires: true, note: l('Cubren una herida limpia sin pegarse.', 'Cover a clean wound without sticking.') },
  adhesive: { name: l('Curitas / tiras adhesivas', 'Adhesive bandages'), group: 'wounds', note: l('Para cortes y raspones chicos.', 'For small cuts and scrapes.') },
  elastic: { name: l('Venda elástica (crepé)', 'Elastic bandage'), group: 'wounds', note: l('Sujeta apósitos, comprime torceduras y sirve para inmovilizar.', 'Holds dressings, compresses sprains and helps immobilize.') },
  tape: { name: l('Cinta hipoalergénica (micropore)', 'Hypoallergenic tape'), unit: ROLLS, group: 'wounds', note: l('Fija gasas y apósitos.', 'Secures gauze and dressings.') },
  triangular: { name: l('Pañuelo triangular (cabestrillo)', 'Triangular bandage (sling)'), group: 'wounds', note: l('Cabestrillo, vendaje de emergencia y sujeción de férulas.', 'Sling, emergency bandage and splint fixing.') },
  saline: { name: l('Solución fisiológica para lavar heridas', 'Saline solution for rinsing wounds'), group: 'wounds', expires: true, note: l('Lava la herida y los ojos; agua potable abundante cuando no hay.', 'Rinses wounds and eyes; plenty of clean water when none is available.') },
  antiseptic: { name: l('Antiséptico para heridas (consultá cuál)', 'Wound antiseptic (ask which one)'), group: 'wounds', medication: true, expires: true, note: l('Para limpiar alrededor de la herida. Consultá a tu médico o farmacéutico cuál usar.', 'To clean around the wound. Ask your doctor or pharmacist which one to use.') },
  eye_shield: { name: l('Escudo ocular rígido', 'Rigid eye shield'), group: 'wounds', note: l('Protege un ojo lastimado sin apretarlo.', 'Protects an injured eye without pressing on it.') },
  nonadherent: { name: l('Gasa no adherente', 'Non-adherent dressing'), group: 'wounds', expires: true, note: l('Para raspones extensos y quemaduras: no se pega a la piel.', 'For wide scrapes and burns: does not stick to the skin.') },
  blister: { name: l('Apósitos para ampollas', 'Blister plasters'), group: 'wounds', note: l('Protegen ampollas y rozaduras de caminata.', 'Protect blisters and hiking chafing.') },
  closure_strips: { name: l('Tiras de cierre de heridas', 'Wound closure strips'), group: 'wounds', expires: true, note: l('Juntan los bordes de un corte limpio y poco profundo.', 'Hold together the edges of a clean, shallow cut.') },

  splint: { name: l('Férula maleable', 'Malleable splint'), group: 'bones', note: l('Inmoviliza un hueso o articulación lastimada.', 'Immobilizes an injured bone or joint.') },

  burn_dressing: { name: l('Apósito para quemaduras (hidrogel)', 'Burn dressing (hydrogel)'), group: 'burns', expires: true, note: l('Cubre la quemadura y calma el dolor.', 'Covers the burn and eases pain.') },
  cold_pack: { name: l('Compresa fría instantánea', 'Instant cold pack'), group: 'burns', expires: true, note: l('Para golpes e hinchazón; no se pone directo sobre la piel.', 'For bumps and swelling; not placed directly on skin.') },

  space_blanket: { name: l('Manta de emergencia', 'Emergency blanket'), group: 'cold', note: l('Evita que la persona herida pierda calor: la hipotermia agrava el sangrado.', 'Keeps an injured person from losing heat: hypothermia worsens bleeding.') },
  heat_pack: { name: l('Calentador químico', 'Chemical heat pack'), group: 'cold', expires: true, note: l('Calor en el pecho y las axilas para la hipotermia; nunca sobre la piel directa.', 'Warmth on chest and armpits for hypothermia; never on bare skin.') },

  gloves: { name: l('Guantes de nitrilo', 'Nitrile gloves'), unit: PAIRS, group: 'protection', note: l('Te protegen de la sangre ajena.', 'Protect you from other people’s blood.') },
  mask: { name: l('Barbijo / mascarilla', 'Face mask'), group: 'protection', note: l('Protección en curaciones y con enfermedades que se contagian.', 'Protection during dressing and with contagious illness.') },
  dust_mask: { name: l('Mascarilla antipolvo', 'Dust mask'), group: 'protection', note: l('Para derrumbes, humo y polvo.', 'For rubble, smoke and dust.') },
  goggles: { name: l('Antiparras de protección', 'Protective goggles'), group: 'protection', note: l('Protegen los ojos de esquirlas y químicos.', 'Protect eyes from splinters and chemicals.') },
  hand_gel: { name: l('Alcohol en gel', 'Hand sanitizer'), group: 'protection', expires: true, note: l('Para las manos cuando no hay agua.', 'For hands when there is no water.') },

  shears: { name: l('Tijera de trauma', 'Trauma shears'), group: 'tools', note: l('Corta ropa y vendas sin lastimar.', 'Cuts clothing and bandages without hurting.') },
  tweezers: { name: l('Pinza', 'Tweezers'), group: 'tools', note: l('Para espinas, astillas y garrapatas.', 'For thorns, splinters and ticks.') },
  safety_pins: { name: l('Alfileres de gancho', 'Safety pins'), group: 'tools', note: l('Para sujetar vendas y cabestrillos.', 'To hold bandages and slings.') },
  marker: { name: l('Marcador indeleble', 'Permanent marker'), group: 'tools', note: l('Para anotar la hora del torniquete o de la picadura en la piel.', 'To write the time of the tourniquet or bite on the skin.') },
  thermometer: { name: l('Termómetro', 'Thermometer'), group: 'tools', note: l('Para fiebre e hipotermia.', 'For fever and hypothermia.') },
  flashlight: { name: l('Linterna frontal y pilas de repuesto', 'Headlamp and spare batteries'), group: 'tools', note: l('Para curar con las dos manos de noche.', 'To treat with both hands at night.') },
  whistle: { name: l('Silbato', 'Whistle'), group: 'tools', note: l('Para pedir ayuda desde lejos o entre escombros.', 'To call for help from afar or in rubble.') },
  bags: { name: l('Bolsas herméticas', 'Zip bags'), group: 'tools', note: l('Para residuos con sangre y para mantener seco el contenido.', 'For bloody waste and to keep contents dry.') },
  oral_syringe: { name: l('Jeringa dosificadora oral', 'Oral dosing syringe'), group: 'tools', note: l('Para dar líquidos a niños con la medida que indique el médico.', 'To give children liquids in the amount a doctor indicates.') },
  pill_organizer: { name: l('Pastillero semanal', 'Weekly pill organizer'), group: 'tools', note: l('Ordena la medicación de uso diario.', 'Organizes daily medication.') },
  bp_monitor: { name: l('Tensiómetro', 'Blood pressure monitor'), group: 'tools', note: l('Para controlar la presión de quien la tiene alterada.', 'To check the pressure of someone with blood pressure problems.') },
  glucometer: { name: l('Glucómetro', 'Glucose meter'), group: 'tools', note: l('Para quien tiene diabetes.', 'For people with diabetes.') },
  oximeter: { name: l('Oxímetro de pulso', 'Pulse oximeter'), group: 'tools', note: l('Mide el oxígeno en sangre: útil en altura y con problemas respiratorios.', 'Measures blood oxygen: useful at altitude and with breathing problems.') },
  waterproof_box: { name: l('Caja o bolsa estanca', 'Waterproof box or bag'), group: 'tools', note: l('Mantiene seco el botiquín en el agua y la lluvia.', 'Keeps the kit dry in water and rain.') },

  analgesic: { name: l('Analgésico / antifebril', 'Pain reliever / fever reducer'), unit: BLISTERS, group: 'meds', medication: true, expires: true, note: l('Para dolor y fiebre. Consultá a tu médico o farmacéutico cuál y cuánto; en niños y con sangrado, la indicación cambia.', 'For pain and fever. Ask your doctor or pharmacist which one and how much; for children and with bleeding the advice changes.') },
  antihistamine: { name: l('Antihistamínico', 'Antihistamine'), unit: BLISTERS, group: 'meds', medication: true, expires: true, note: l('Para alergias leves y picaduras. No reemplaza la adrenalina en una reacción grave. Consultá a tu médico o farmacéutico.', 'For mild allergies and stings. It does not replace epinephrine in a severe reaction. Ask your doctor or pharmacist.') },
  ors: { name: l('Sales de rehidratación oral', 'Oral rehydration salts'), unit: PACKS, group: 'meds', expires: true, note: l('Para diarrea, vómitos y golpe de calor leve.', 'For diarrhea, vomiting and mild heat illness.') },
  antidiarrheal: { name: l('Antidiarreico', 'Anti-diarrheal'), unit: BLISTERS, group: 'meds', medication: true, expires: true, note: l('Consultá a tu médico o farmacéutico antes de llevarlo y usarlo.', 'Ask your doctor or pharmacist before carrying and using it.') },
  antiemetic: { name: l('Antiemético / para el mareo', 'Anti-nausea / motion sickness'), unit: BLISTERS, group: 'meds', medication: true, expires: true, note: l('Para mareo de viaje o náutico. Consultá a tu médico o farmacéutico.', 'For travel or sea sickness. Ask your doctor or pharmacist.') },
  topical_antibiotic: { name: l('Ungüento antibiótico', 'Antibiotic ointment'), group: 'meds', medication: true, expires: true, note: l('Para raspones y cortes limpios. Consultá a tu médico o farmacéutico.', 'For clean scrapes and cuts. Ask your doctor or pharmacist.') },
  sting_cream: { name: l('Crema para picaduras y alergias de piel', 'Sting and skin-allergy cream'), group: 'meds', medication: true, expires: true, note: l('Alivia picazón de picaduras. Consultá a tu médico o farmacéutico.', 'Relieves itch from stings. Ask your doctor or pharmacist.') },
  eyewash: { name: l('Solución para lavado ocular', 'Eye wash solution'), group: 'meds', expires: true, note: l('Para enjuagar polvo o químicos de los ojos.', 'To rinse dust or chemicals out of the eyes.') },
  sugar: { name: l('Azúcar o glucosa rápida', 'Sugar or fast glucose'), group: 'meds', expires: true, note: l('Para una baja de azúcar en quien tiene diabetes.', 'For low blood sugar in someone with diabetes.') },
  sunscreen: { name: l('Protector solar', 'Sunscreen'), group: 'meds', expires: true, note: l('Previene quemaduras de sol, sobre todo en altura y agua.', 'Prevents sunburn, especially at altitude and on water.') },
  repellent: { name: l('Repelente de insectos', 'Insect repellent'), group: 'meds', expires: true, note: l('Previene picaduras y enfermedades que transmiten.', 'Prevents bites and the diseases they carry.') },
  personal_meds: { name: l('Tu medicación personal', 'Your personal medication'), group: 'meds', medication: true, expires: true, note: l('La que te indicó tu médico, para los días que dure la salida, más unos días de reserva.', 'What your doctor prescribed, for the days of the trip plus a few spare days.') },
  epinephrine: { name: l('Autoinyector de adrenalina (si tu médico lo indicó)', 'Epinephrine auto-injector (if your doctor prescribed it)'), group: 'meds', medication: true, expires: true, note: l('Solo para quien tiene una alergia grave diagnosticada: lo indica y explica el médico. Llevalo siempre encima.', 'Only for people with a diagnosed severe allergy: a doctor prescribes and explains it. Carry it at all times.') },

  med_card: { name: l('Ficha médica y teléfonos impresos', 'Printed medical card and phone numbers'), group: 'docs', note: l('Alergias, medicación y contactos, por si el celular no anda. La app los tiene en «Ficha médica».', 'Allergies, medication and contacts in case the phone fails. The app keeps them in «Medical card».') },
  note_card: { name: l('Libreta o tarjeta para anotar horas y síntomas', 'Notebook or card to record times and symptoms'), group: 'docs', note: l('Hora del torniquete, de la picadura y cambios en la persona.', 'Time of the tourniquet or bite and changes in the person.') },
};

const ORDER: Level[] = ['individual', 'advanced', 'group'];
const rank = (lv: Level) => ORDER.indexOf(lv);

/** [artículo, nivel desde el que aparece, cantidad fija, por persona, por persona y por día, tope] */
type Line = [item: string, from: Level, base?: number, perPerson?: number, perPersonDay?: number, max?: number];

export interface Scenario {
  id: string;
  name: L;
  desc: L;
  /** Tipo de botiquín que se crea. */
  kitType: KitType;
  people: number;
  days: number;
  /** Si las cantidades dependen de los días (salidas, viajes); si no, no se pregunta. */
  usesDays: boolean;
  lines: Line[];
}

// Conjuntos que se repiten.
const TRAUMA: Line[] = [
  ['tourniquet', 'individual', 1],
  ['tourniquet', 'advanced', 1],
  ['hemostatic', 'individual', 1],
  ['pressure_bandage', 'individual', 1],
  ['pressure_bandage', 'advanced', 1],
  ['gloves', 'individual', 2, 1, 0, 10],
  ['shears', 'individual', 1],
  ['marker', 'individual', 1],
  ['note_card', 'individual', 1],
  ['space_blanket', 'individual', 0, 1, 0, 6],
  ['triangular', 'individual', 2],
  ['tape', 'individual', 1],
  ['chest_seal', 'advanced', 1],
  ['trauma_dressing', 'advanced', 1],
  ['eye_shield', 'advanced', 1],
  ['splint', 'advanced', 1],
  ['cpr_mask', 'advanced', 1],
  ['npa', 'advanced', 1],
];
const WOUNDS: Line[] = [
  ['sterile_gauze', 'individual', 10, 2, 0, 40],
  ['adhesive', 'individual', 10, 5, 0, 50],
  ['elastic', 'individual', 2],
  ['tape', 'individual', 1],
  ['saline', 'individual', 1],
  ['antiseptic', 'individual', 1],
  ['tweezers', 'individual', 1],
  ['safety_pins', 'individual', 4, 0, 0, 10],
  ['sterile_dressing', 'advanced', 4, 1],
  ['nonadherent', 'advanced', 3],
  ['closure_strips', 'advanced', 5],
  ['topical_antibiotic', 'advanced', 1],
];
const BASIC_MEDS: Line[] = [
  ['analgesic', 'individual', 1],
  ['antihistamine', 'individual', 1],
  ['ors', 'individual', 2, 0, 1, 20],
  ['personal_meds', 'individual', 0, 1],
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'home',
    name: l('Casa', 'Home'),
    desc: l('Botiquín del hogar para golpes, cortes, quemaduras, fiebre y primeras horas de una emergencia.', 'Home kit for bumps, cuts, burns, fever and the first hours of an emergency.'),
    kitType: 'general', people: 4, days: 1, usesDays: false,
    lines: [...WOUNDS, ...BASIC_MEDS, ['thermometer', 'individual', 1], ['gloves', 'individual', 2, 1, 0, 10], ['burn_dressing', 'individual', 2], ['cold_pack', 'individual', 2], ['hand_gel', 'individual', 1], ['mask', 'individual', 0, 2, 0, 10],
      ['tourniquet', 'advanced', 1], ['hemostatic', 'advanced', 1], ['pressure_bandage', 'advanced', 1], ['triangular', 'advanced', 2], ['splint', 'advanced', 1], ['space_blanket', 'advanced', 0, 1, 0, 6], ['cpr_mask', 'advanced', 1], ['eyewash', 'advanced', 1], ['sting_cream', 'advanced', 1], ['antidiarrheal', 'advanced', 1], ['shears', 'individual', 1], ['flashlight', 'advanced', 1], ['med_card', 'individual', 0, 1], ['bags', 'advanced', 5, 0, 0, 10]],
  },
  {
    id: 'car',
    name: l('Auto', 'Car'),
    desc: l('Para un choque o un varamiento en ruta: hemorragia, abrigo y espera de la ayuda.', 'For a crash or being stranded on the road: bleeding, warmth and waiting for help.'),
    kitType: 'trauma', people: 4, days: 1, usesDays: false,
    lines: [...TRAUMA, ['sterile_gauze', 'individual', 10, 0, 0, 40], ['adhesive', 'individual', 10, 0, 0, 50], ['elastic', 'individual', 1], ['saline', 'individual', 1], ['burn_dressing', 'advanced', 1], ['flashlight', 'individual', 1], ['whistle', 'advanced', 0, 1], ['analgesic', 'advanced', 1], ['ors', 'advanced', 4, 0, 0, 20], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'moto',
    name: l('Moto o bicicleta', 'Motorcycle or bicycle'),
    desc: l('Compacto para caídas: raspones extensos, hemorragia y fracturas hasta que llegue la ayuda.', 'Compact for falls: wide scrapes, bleeding and fractures until help arrives.'),
    kitType: 'trauma', people: 1, days: 1, usesDays: false,
    lines: [...TRAUMA.filter(([i]) => i !== 'npa'), ['nonadherent', 'individual', 3], ['sterile_gauze', 'individual', 6, 0, 0, 40], ['adhesive', 'individual', 6, 0, 0, 50], ['elastic', 'individual', 1], ['saline', 'individual', 1], ['burn_dressing', 'advanced', 1], ['blister', 'advanced', 2, 0, 0, 40], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'escape',
    name: l('Mochila de escape', 'Bug-out bag'),
    desc: l('Para salir de casa con lo justo durante 3 días o más: trauma, curaciones y medicación.', 'To leave home with the essentials for 3 days or more: trauma, dressings and medication.'),
    kitType: 'general', people: 1, days: 3, usesDays: true,
    lines: [...TRAUMA, ...WOUNDS, ...BASIC_MEDS, ['blister', 'individual', 4, 0, 0, 40], ['burn_dressing', 'individual', 2], ['mask', 'individual', 0, 2, 0, 10], ['hand_gel', 'individual', 1], ['flashlight', 'individual', 1], ['whistle', 'individual', 0, 1], ['thermometer', 'advanced', 1], ['heat_pack', 'advanced', 0, 1, 0, 6], ['antidiarrheal', 'advanced', 1], ['sunscreen', 'advanced', 1], ['repellent', 'advanced', 1], ['bags', 'individual', 3, 0, 0, 10], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'trek',
    name: l('Trekking y montaña', 'Trekking and mountains'),
    desc: l('Salidas de varios días lejos de la ayuda: ampollas, torceduras, frío, altura y evacuación.', 'Multi-day trips far from help: blisters, sprains, cold, altitude and evacuation.'),
    kitType: 'general', people: 2, days: 3, usesDays: true,
    lines: [...TRAUMA, ...WOUNDS, ...BASIC_MEDS, ['blister', 'individual', 4, 2, 0, 40], ['splint', 'individual', 1], ['heat_pack', 'advanced', 0, 1, 0, 6], ['antidiarrheal', 'advanced', 1], ['sunscreen', 'individual', 1], ['repellent', 'advanced', 1], ['oximeter', 'advanced', 1], ['flashlight', 'individual', 1], ['whistle', 'individual', 0, 1], ['bags', 'individual', 3, 0, 0, 10], ['burn_dressing', 'advanced', 1], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'camping',
    name: l('Camping, pesca y caza', 'Camping, fishing and hunting'),
    desc: l('Cortes con cuchillo o anzuelo, quemaduras de fogón, picaduras y garrapatas.', 'Knife or hook cuts, campfire burns, stings and ticks.'),
    kitType: 'general', people: 2, days: 3, usesDays: true,
    lines: [...TRAUMA.filter(([i]) => i !== 'npa'), ...WOUNDS, ...BASIC_MEDS, ['burn_dressing', 'individual', 2], ['cold_pack', 'individual', 1], ['repellent', 'individual', 1], ['sunscreen', 'individual', 1], ['sting_cream', 'advanced', 1], ['flashlight', 'individual', 1], ['whistle', 'advanced', 0, 1], ['eyewash', 'advanced', 1], ['bags', 'individual', 3, 0, 0, 10], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'travel',
    name: l('Viaje', 'Travel'),
    desc: l('Para viajes largos o a otro país: estómago, mareo, sol, mosquitos y medicación personal.', 'For long trips or abroad: stomach, motion sickness, sun, mosquitoes and personal medication.'),
    kitType: 'general', people: 2, days: 7, usesDays: true,
    lines: [['sterile_gauze', 'individual', 6, 0, 0, 40], ['adhesive', 'individual', 10, 3, 0, 50], ['tape', 'individual', 1], ['elastic', 'individual', 1], ['antiseptic', 'individual', 1], ['tweezers', 'individual', 1], ['thermometer', 'individual', 1], ...BASIC_MEDS, ['antidiarrheal', 'individual', 1], ['antiemetic', 'individual', 1], ['sunscreen', 'individual', 1, 0, 0], ['repellent', 'individual', 1], ['sting_cream', 'advanced', 1], ['topical_antibiotic', 'advanced', 1], ['blister', 'advanced', 4, 0, 0, 40], ['hand_gel', 'individual', 1], ['mask', 'advanced', 0, 2, 0, 10], ['gloves', 'individual', 2, 0, 0, 10], ['tourniquet', 'advanced', 1], ['hemostatic', 'advanced', 1], ['pressure_bandage', 'advanced', 1], ['space_blanket', 'advanced', 0, 1, 0, 6], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'boat',
    name: l('Embarcación', 'Boat'),
    desc: l('Para navegar o remar: cortes y quemaduras, mareo, sol, frío y mantenerlo todo seco.', 'For sailing or paddling: cuts and burns, seasickness, sun, cold, and keeping it all dry.'),
    kitType: 'general', people: 4, days: 2, usesDays: true,
    lines: [['waterproof_box', 'individual', 1], ...TRAUMA.filter(([i]) => i !== 'npa'), ...WOUNDS, ...BASIC_MEDS, ['antiemetic', 'individual', 1], ['sunscreen', 'individual', 1], ['burn_dressing', 'individual', 2], ['cold_pack', 'individual', 2], ['eyewash', 'advanced', 1], ['heat_pack', 'advanced', 0, 1, 0, 6], ['whistle', 'individual', 0, 1], ['flashlight', 'individual', 1], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'family',
    name: l('Niños y familia', 'Children and family'),
    desc: l('Para casa y paseos con chicos: fiebre, golpes, quemaduras, deshidratación y alergias.', 'For home and outings with children: fever, bumps, burns, dehydration and allergies.'),
    kitType: 'general', people: 4, days: 1, usesDays: false,
    lines: [...WOUNDS, ['thermometer', 'individual', 1], ['oral_syringe', 'individual', 2], ['analgesic', 'individual', 1], ['antihistamine', 'individual', 1], ['ors', 'individual', 4, 1, 0, 20], ['sting_cream', 'individual', 1], ['burn_dressing', 'individual', 2], ['cold_pack', 'individual', 2], ['gloves', 'individual', 2, 1, 0, 10], ['hand_gel', 'individual', 1], ['personal_meds', 'individual', 0, 1], ['cpr_mask', 'advanced', 1], ['tourniquet', 'advanced', 1], ['hemostatic', 'advanced', 1], ['pressure_bandage', 'advanced', 1], ['splint', 'advanced', 1], ['eyewash', 'advanced', 1], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'elderly',
    name: l('Adulto mayor o enfermedades crónicas', 'Older adults or chronic conditions'),
    desc: l('Medicación diaria, controles y curaciones que no se pegan a la piel frágil.', 'Daily medication, monitoring and dressings that do not stick to fragile skin.'),
    kitType: 'general', people: 1, days: 1, usesDays: false,
    lines: [['personal_meds', 'individual', 0, 2], ['pill_organizer', 'individual', 1], ['thermometer', 'individual', 1], ['nonadherent', 'individual', 6], ['sterile_gauze', 'individual', 10, 0, 0, 40], ['tape', 'individual', 2], ['elastic', 'individual', 2], ['gloves', 'individual', 2, 0, 0, 10], ['analgesic', 'individual', 1], ['ors', 'individual', 4, 0, 0, 20], ['sugar', 'individual', 1], ['bp_monitor', 'advanced', 1], ['glucometer', 'advanced', 1], ['oximeter', 'advanced', 1], ['saline', 'advanced', 1], ['med_card', 'individual', 0, 1], ['flashlight', 'advanced', 1]],
  },
  {
    id: 'rural',
    name: l('Zona rural o estancia aislada', 'Remote rural area or ranch'),
    desc: l('Cuando la ayuda tarda horas: trauma, fracturas, mordeduras y picaduras, frío y calor.', 'When help takes hours: trauma, fractures, bites and stings, cold and heat.'),
    kitType: 'trauma', people: 4, days: 1, usesDays: false,
    lines: [...TRAUMA, ...WOUNDS, ...BASIC_MEDS, ['splint', 'individual', 2], ['elastic', 'individual', 4], ['sting_cream', 'individual', 1], ['burn_dressing', 'individual', 3], ['cold_pack', 'individual', 2], ['heat_pack', 'advanced', 0, 1, 0, 6], ['eyewash', 'individual', 1], ['thermometer', 'individual', 1], ['flashlight', 'individual', 1], ['whistle', 'advanced', 0, 1], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'workshop',
    name: l('Taller u obra', 'Workshop or work site'),
    desc: l('Cortes, aplastamientos, quemaduras y salpicaduras en los ojos, pensado para un lugar de trabajo.', 'Cuts, crush injuries, burns and eye splashes, designed for a workplace.'),
    kitType: 'trauma', people: 4, days: 1, usesDays: false,
    lines: [...TRAUMA.filter(([i]) => i !== 'npa'), ...WOUNDS, ['eyewash', 'individual', 2], ['eye_shield', 'individual', 2], ['burn_dressing', 'individual', 3], ['cold_pack', 'individual', 3], ['goggles', 'advanced', 2], ['nonadherent', 'individual', 3], ['analgesic', 'advanced', 1], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'disaster',
    name: l('Terremoto o inundación', 'Earthquake or flood'),
    desc: l('Para los primeros días sin ayuda cerca: heridas, polvo, agua contaminada y comunicación.', 'For the first days with no help nearby: wounds, dust, contaminated water and signalling.'),
    kitType: 'general', people: 4, days: 3, usesDays: true,
    lines: [...TRAUMA, ...WOUNDS, ...BASIC_MEDS, ['dust_mask', 'individual', 0, 2], ['goggles', 'advanced', 0, 1], ['whistle', 'individual', 0, 1], ['hand_gel', 'individual', 1], ['antidiarrheal', 'advanced', 1], ['eyewash', 'advanced', 1], ['flashlight', 'individual', 1], ['bags', 'individual', 5, 0, 0, 10], ['burn_dressing', 'advanced', 2], ['med_card', 'individual', 0, 1]],
  },
  {
    id: 'bleeding',
    name: l('Hemorragia grave (kit individual de trauma)', 'Severe bleeding (individual trauma kit)'),
    desc: l('Inspirado en el IFAK/JFAK militar, para civiles: hemorragia, vía aérea y tórax, en un kit chico que se lleva encima.', 'Inspired by the military IFAK/JFAK, for civilians: bleeding, airway and chest, in a small kit you carry.'),
    kitType: 'bleeding', people: 1, days: 1, usesDays: false,
    lines: [['tourniquet', 'individual', 1], ['tourniquet', 'advanced', 1], ['hemostatic', 'individual', 1], ['pressure_bandage', 'individual', 1], ['gauze_roll', 'individual', 1], ['chest_seal', 'individual', 1], ['gloves', 'individual', 2, 0, 0, 10], ['shears', 'individual', 1], ['marker', 'individual', 1], ['note_card', 'individual', 1], ['space_blanket', 'individual', 1, 0, 0, 6], ['tape', 'individual', 1], ['triangular', 'individual', 1], ['eye_shield', 'advanced', 1], ['splint', 'advanced', 1], ['cpr_mask', 'advanced', 1], ['trauma_dressing', 'advanced', 1], ['npa', 'advanced', 1], ['needle', 'advanced', 1]],
  },
  {
    id: 'anaphylaxis',
    name: l('Alergia grave (anafilaxia)', 'Severe allergy (anaphylaxis)'),
    desc: l('Para quien tiene o convive con alguien con una alergia grave: lo indicado por el médico, siempre a mano.', 'For someone with, or living with, a person with a severe allergy: what the doctor prescribed, always at hand.'),
    kitType: 'anaphylaxis', people: 1, days: 1, usesDays: false,
    lines: [['epinephrine', 'individual', 2], ['antihistamine', 'individual', 1], ['personal_meds', 'individual', 0, 1], ['med_card', 'individual', 0, 1], ['note_card', 'individual', 1], ['space_blanket', 'advanced', 1, 0, 0, 6], ['cpr_mask', 'advanced', 1], ['gloves', 'advanced', 2, 0, 0, 10]],
  },
  {
    id: 'burns',
    name: l('Quemaduras', 'Burns'),
    desc: l('Para cocina, fogón o taller: enfriar, cubrir y no pegar nada a la piel.', 'For kitchen, campfire or workshop: cool, cover and never stick anything to the skin.'),
    kitType: 'burns', people: 1, days: 1, usesDays: false,
    lines: [['burn_dressing', 'individual', 4], ['nonadherent', 'individual', 6], ['saline', 'individual', 2], ['cold_pack', 'individual', 2], ['elastic', 'individual', 2], ['tape', 'individual', 1], ['gloves', 'individual', 2, 0, 0, 10], ['shears', 'individual', 1], ['space_blanket', 'advanced', 1, 0, 0, 6], ['analgesic', 'advanced', 1], ['ors', 'advanced', 2, 0, 0, 20]],
  },
];

export interface BuiltLine {
  id: string;
  item: CatalogItem;
  qty: number;
}

/**
 * Cuántos juegos de las cantidades fijas hacen falta (torniquetes, vendajes, gasas hemostáticas…). Están pensadas para las personas de
 * partida del escenario (1 en los kits individuales, 4 en casa o auto). El equipo de trauma no se necesita «por persona» sino por herido, y es
 * improbable que haya más de dos heridos graves a la vez: con más gente que las de partida, **dos juegos** y no más (20 personas no llevan 20
 * torniquetes). Lo de uso personal (guantes, mantas, medicación propia) tiene su propia cuenta por persona y su tope en cada línea.
 */
export function setsFor(people: number, base: number): number {
  return Math.min(2, Math.max(1, Math.ceil(people / base)));
}

/** Lo que lleva el botiquín para ese escenario, nivel, cantidad de personas y días (los repetidos se suman). */
export function buildList(scenarioId: string, level: Level, people: number, days: number): BuiltLine[] {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc) return [];
  const p = Math.max(1, Math.floor(people));
  const d = Math.max(1, Math.floor(days));
  const sets = setsFor(p, sc.people);
  const totals = new Map<string, number>();
  const caps = new Map<string, number>();
  for (const [id, from, base = 0, perPerson = 0, perDay = 0, max] of sc.lines) {
    if (rank(from) > rank(level) || !CATALOG[id]) continue;
    totals.set(id, (totals.get(id) ?? 0) + base * sets + perPerson * p + perDay * p * (sc.usesDays ? d : 1));
    if (max !== undefined) caps.set(id, Math.min(max, caps.get(id) ?? max));
  }
  for (const [id, cap] of caps) totals.set(id, Math.min(totals.get(id) ?? 0, cap));
  return [...totals.entries()]
    .map(([id, qty]) => ({ id, item: CATALOG[id]!, qty: Math.max(1, Math.ceil(qty)) }))
    .sort((a, b) => GROUPS.indexOf(a.item.group) - GROUPS.indexOf(b.item.group) || a.item.name.es.localeCompare(b.item.name.es, 'es'));
}

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);

/** Fuentes que se muestran al pie del asistente (el detalle y las condiciones de uso, en docs/FUENTES-DE-DATOS.md). */
export const SOURCES: L[] = [
  l('Committee on TCCC / Joint Trauma System (EE. UU.): TCCC Guidelines, 1 de mayo de 2026, y notas del curso Combat Lifesaver (JFAK/IFAK).', 'Committee on TCCC / Joint Trauma System (US): TCCC Guidelines, 1 May 2026, and Combat Lifesaver course notes (JFAK/IFAK).'),
  l('Ministerio de Salud de la Nación (Argentina): Manual de Primeros Auxilios y Prevención de Lesiones (2016) y guías de envenenamiento por ofidios, escorpiones y arañas.', 'Ministry of Health (Argentina): First Aid and Injury Prevention Manual (2016) and snake, scorpion and spider envenomation guidelines.'),
  l('Cruz Roja Americana, ISEA (ANSI/ISEA Z308.1-2021), C-TECC (TECC 2024), SINAE (Uruguay), SENAPRED (Chile) y MINSA (Perú).', 'American Red Cross, ISEA (ANSI/ISEA Z308.1-2021), C-TECC (TECC 2024), SINAE (Uruguay), SENAPRED (Chile) and MINSA (Peru).'),
];

/**
 * Palabras con las que se reconoce un artículo que la persona ya cargó con otro nombre («Torniquete CAT», «Gasa hemostática»…): si el
 * nombre del artículo las contiene (sin tildes ni mayúsculas), cuenta como el mismo.
 */
export const KEYS: Record<string, string[]> = {
  tourniquet: ['torniquete', 'tourniquet'],
  hemostatic: ['hemostatic', 'combat gauze', 'quikclot'],
  pressure_bandage: ['israel', 'vendaje de emergencia', 'emergency bandage', 'pressure bandage'],
  trauma_dressing: ['apósito de trauma', 'aposito de trauma', 'trauma dressing'],
  gauze_roll: ['gasa en rollo', 'rolled gauze'],
  cpr_mask: ['rcp', 'cpr', 'pocket mask'],
  npa: ['nasofaring', 'nasopharyng', 'npa'],
  chest_seal: ['sello tor', 'chest seal', 'hyfin'],
  needle: ['descompresi', 'decompression'],
  sterile_gauze: ['gasas', 'gasa esteril', 'gauze pad'],
  adhesive: ['curita', 'tira adhesiva', 'adhesive bandage', 'band-aid'],
  elastic: ['venda elastica', 'venda crepe', 'elastic bandage'],
  tape: ['micropore', 'cinta hipoalergenica', 'hypoallergenic tape'],
  triangular: ['triangular', 'cabestrillo'],
  saline: ['fisiologica', 'saline'],
  eye_shield: ['escudo ocular', 'eye shield'],
  splint: ['ferula', 'splint', 'sam splint'],
  burn_dressing: ['quemadura', 'hidrogel', 'burn dressing'],
  space_blanket: ['manta de emergencia', 'manta termica', 'manta de supervivencia', 'space blanket', 'emergency blanket'],
  gloves: ['guantes', 'gloves'],
  shears: ['tijera', 'shears'],
  tweezers: ['pinza', 'tweezers'],
  marker: ['marcador', 'marker'],
  thermometer: ['termometro', 'thermometer'],
  analgesic: ['analgesic', 'paracetamol', 'ibuprofeno', 'antifebril'],
  antihistamine: ['antihistamin'],
  ors: ['rehidrata', 'oral rehydration'],
  epinephrine: ['adrenalina', 'epinephrine', 'epipen'],
  sting_cream: ['picadura', 'sting'],
  closure_strips: ['cierre de heridas', 'closure strip', 'steri'],
  sugar: ['azucar', 'glucosa', 'glucose', 'sugar'],
  antiseptic: ['antiseptic', 'povidona', 'iodo'],
  nonadherent: ['no adherente', 'non-adherent'],
  heat_pack: ['calentador', 'heat pack'],
  eyewash: ['lavado ocular', 'eye wash'],
};

export const matchesCatalog = (id: string, normalizedItemName: string): boolean => {
  const entry = CATALOG[id];
  if (!entry) return false;
  const keys = KEYS[id] ?? [];
  const names = [entry.name.es, entry.name.en].map((n) => n.toLowerCase());
  // Sin tildes: se compara contra las dos formas.
  const strip = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const target = strip(normalizedItemName.toLowerCase());
  return keys.some((k) => target.includes(strip(k.toLowerCase()))) || names.some((n) => strip(n) === target);
};

export { unitFor } from '@/modules/inventory/domain/unitText';
