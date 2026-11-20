# Pedidos formales a organismos de Brasil (borradores, NO enviados)

Redactados el 2026-11-20 a partir de la lista de `docs/NUEVOS-PAISES.md` («Pedidos formales pendientes») y de `docs/investigaciones/brasil-2026-11-19.md`. **Ninguno se envió.** Cada uno sale desde `contacto.vikarg@gmail.com` (el único correo permitido), con quien dirige el proyecto aprobando el envío uno por uno. Cada borrador va en portugués (el que se manda) y en español (para revisar). Los destinos exactos (formulario «Fale Conosco» de cada sitio o, para organismos públicos, la plataforma Fala.BR de la Ley de Acceso a la Información) hay que verificarlos al enviar: no se inventaron correos ni nombres de personas. El portugués conviene que lo lea una persona de Brasil antes del envío (ver `docs/TRADUCCION-PT-BR.md`).

Reglas: el proyecto no pide nada que se pueda obtener esquivando una protección; los pedidos son para licencias, credenciales y confirmaciones. No se firma con nombre propio de nadie.

## Texto común (PT)

> Olá. Somos o projeto «Ferramentas de Sobrevivência por VikArg» (em inglês, «Survival Tools By VikArg»), um aplicativo gratuito, sem publicidade e de código aberto (GPL-3.0), que funciona offline e ajuda pessoas a se prepararem para emergências (mapas, rádio, ríos, alertas, primeiros socorros). Usamos dados públicos de órgãos brasileiros sempre com crédito visível à fonte, sem alterar seus valores e dizendo na tela que o aviso é «informativo, não oficial». Escrevemos para pedir o que segue.

## Texto común (ES)

> Hola. Somos el proyecto «Herramientas de Supervivencia por VikArg» (en inglés «Survival Tools By VikArg»), una app gratuita, sin publicidad y de código abierto (GPL-3.0), que funciona sin conexión y ayuda a prepararse para emergencias (mapas, radio, ríos, alertas, primeros auxilios). Usamos datos públicos de organismos brasileños siempre con crédito visible a la fuente, sin alterar sus valores y aclarando en pantalla que el aviso es «informativo, no oficial». Escribimos para pedir lo que sigue.

## Cierre común (PT / ES)

> Agradecemos desde já a atenção. Responder para: contacto.vikarg@gmail.com. Atenciosamente, equipe do projeto Ferramentas de Sobrevivência por VikArg.

> Agradecemos desde ya la atención. Responder a: contacto.vikarg@gmail.com. Atentamente, el equipo del proyecto Herramientas de Supervivencia por VikArg.

---


## 1. INMET (Instituto Nacional de Meteorologia)

**Asunto (PT):** Redistribuição dos avisos CAP e uso da API

**Português**

> Prezados(as) do INMET,
>
> Contexto: hoje o aviso é mostrado como «informativo, não oficial», com crédito ao INMET.
>
> 1. Confirmar se o feed CAP/RSS de avisos (`apiprevmet3.inmet.gov.br/avisos/ativos` e `/avisos/rss`) pode ser redistribuído em um aplicativo, com citação da fonte, e qual é a política de uso (frequência máxima de consulta) da API.
> 2. Explicar por que `apitempo.inmet.gov.br/estacao/{ini}/{fin}/{cod}` devolve HTTP 204 para estações com situação «Operante».

**Español (para revisar)**

> Estimados/as de INMET:
>
> Contexto: Hoy el aviso se muestra como «informativo, no oficial», con crédito al INMET.
>
> 1. Confirmar si el feed CAP/RSS de avisos puede redistribuirse en una app, citando la fuente, y cuál es la política de uso (frecuencia máxima de consulta) de la API.
> 2. Explicar por qué `apitempo.inmet.gov.br/estacao/{ini}/{fin}/{cod}` devuelve HTTP 204 para estaciones «Operante».


## 2. ANA (Agência Nacional de Águas e Saneamento Básico)

**Asunto (PT):** Licença da telemetria e acesso à API HidroWeb

**Português**

> Prezados(as) do ANA,
>
> Contexto: Usamos 33 estações (bacia do Uruguai, Iguaçu e Paraná de fronteira), uma consulta por estação com pausa de 1 s, e enviamos avisos informativos de cheia a quem salvou um local a menos de 5 km.
>
> 1. Informar os termos de uso e a licença do serviço de telemetria (`telemetriaws1.ana.gov.br/ServiceANA.asmx`) e do portal de dados abertos, e se a redistribuição com crédito é permitida.
> 2. Solicitar credenciais (ou o procedimento) para a nova API HidroWeb (`ana.gov.br/hidrowebservice`), que hoje responde 401 e não é usada nem contornada.
> 3. Perguntar se o serviço legado em HTTP (sem cifra) continuará disponível e se há uma versão HTTPS.

**Español (para revisar)**

> Estimados/as de ANA:
>
> Contexto: Usamos 33 estaciones (cuenca del Uruguay, Iguaçu y Paraná de frontera), una consulta por estación con pausa de 1 s, y mandamos avisos informativos de crecida a quien guardó un lugar a menos de 5 km.
>
> 1. Informar los términos y la licencia del servicio de telemetría y del portal de datos abiertos, y si se permite redistribuir con crédito.
> 2. Pedir credenciales (o el procedimiento) para la nueva API HidroWeb, que hoy da 401 y no se usa ni se esquiva.
> 3. Preguntar si el servicio legado por HTTP seguirá disponible y si hay versión HTTPS.


## 3. SGB/CPRM (Serviço Geológico do Brasil)

**Asunto (PT):** Cotas de atenção, alerta e inundação das demais bacias

**Português**

> Prezados(as) do SGB/CPRM,
>
> Contexto: Hoje usamos a tabela 2 do relatório de 2023 (24 estações com cotas) e dizemos na tela que são informativas.
>
> 1. Informar uma URL estável para os boletins do SACE/SAH e para os serviços OGC do GeoSGB (geologia 1:1.000.000), e a licença de uso.
> 2. Enviar (ou indicar onde estão publicadas e vigentes) as cotas de atenção/alerta/inundação das demais bacias: Iguaçu, Taquari-Antas, Jacuí, Itajaí e Paraná.
> 3. Confirmar que as cotas do relatório de dezembro de 2023 do SAH Bacia do Rio Uruguai continuam vigentes.

**Español (para revisar)**

> Estimados/as de SGB/CPRM:
>
> Contexto: Hoy usamos la tabla 2 del informe de 2023 (24 estaciones con cotas) y decimos en pantalla que son informativas.
>
> 1. Indicar una URL estable para los boletines SACE/SAH y los servicios OGC de GeoSGB (geología 1:1.000.000), y la licencia de uso.
> 2. Enviar (o indicar dónde están publicadas y vigentes) las cotas de atención/alerta/inundación de las demás cuencas: Iguaçu, Taquari-Antas, Jacuí, Itajaí y Paraná.
> 3. Confirmar que las cotas del informe de diciembre de 2023 del SAH Bacia do Rio Uruguai siguen vigentes.


## 4. CENAD / MIDR (Defesa Civil Nacional)

**Asunto (PT):** Feed CAP do IDAP

**Português**

> Prezados(as) do CENAD / MIDR,
>
> Contexto: Mostraríamos o alerta como «oficial» somente se o feed vier do órgão e com crédito; nada seria reescrito.
>
> 1. Informar a URL pública do feed CAP do sistema IDAP (a Portaria 2.458/2026 prevê que seja público), o formato e as condições de redistribuição.

**Español (para revisar)**

> Estimados/as de CENAD / MIDR:
>
> Contexto: Mostraríamos la alerta como «oficial» solo si el feed viene del organismo y con crédito; nada se reescribiría.
>
> 1. Informar la URL pública del feed CAP del IDAP (la Portaria 2.458/2026 prevé que sea público), el formato y las condiciones de redistribución.


## 5. CEMADEN

**Asunto (PT):** Acesso aos dados sem captcha

**Português**

> Prezados(as) do CEMADEN,
>
> 1. Solicitar acesso aos dados de pluviômetros e alertas por um canal sem captcha (API ou arquivo), com permissão de redistribuição com crédito. A página de download atual exige captcha e não foi usada.

**Español (para revisar)**

> Estimados/as de CEMADEN:
>
> 1. Pedir acceso a los datos de pluviómetros y alertas por un canal sin captcha (API o archivo), con permiso de redistribución con crédito. La página de descarga actual exige captcha y no se usó.


## 6. DECEA / REDEMET

**Asunto (PT):** Chave da API de radar

**Português**

> Prezados(as) do DECEA / REDEMET,
>
> 1. Solicitar a chave da API da REDEMET (hoje responde 401 «No API key found») para os produtos de radar, e a permissão de redistribuí-los com crédito em um aplicativo gratuito.

**Español (para revisar)**

> Estimados/as de DECEA / REDEMET:
>
> 1. Pedir la clave de la API de REDEMET (hoy da 401) para los productos de radar y el permiso de redistribuirlos con crédito en una app gratuita.


## 7. Marinha do Brasil (DHN / CHM, BNDO)

**Asunto (PT):** Marés, canal 16 e serviço SAR

**Português**

> Prezados(as) do Marinha do Brasil,
>
> 1. Solicitar as constantes harmônicas (ou tábuas de maré) dos principais portos e a permissão de uso com crédito. O site está atrás de um desafio do Cloudflare e não foi acessado.
> 2. Confirmar os canais VHF de socorro e segurança usados no Brasil (canal 16, 156,800 MHz) e os contatos do serviço SALVAMAR/MRCC para publicá-los com a fonte.

**Español (para revisar)**

> Estimados/as de Marinha do Brasil:
>
> 1. Pedir las constantes armónicas (o tablas de marea) de los principales puertos y el permiso de uso con crédito. El sitio está detrás de un desafío de Cloudflare y no se accedió.
> 2. Confirmar los canales VHF de socorro y seguridad usados en Brasil (canal 16, 156,800 MHz) y los contactos del servicio SALVAMAR/MRCC para publicarlos con la fuente.


## 8. ICMBio

**Asunto (PT):** Telefones por unidade e regras de visitação

**Português**

> Prezados(as) do ICMBio,
>
> 1. Enviar a lista de contatos/telefones das unidades de conservação e as regras de visitação vigentes (Itatiaia, Serra dos Órgãos, Iguaçu, Aparados da Serra, Pico da Neblina), com permissão de publicação.
> 2. Esclarecer, para o Pico da Neblina, o papel do Exército e da Funai na autorização de subida.
> 3. Informar se alguma unidade publica frequências de rádio de uso público.

**Español (para revisar)**

> Estimados/as de ICMBio:
>
> 1. Enviar la lista de contactos/teléfonos de las unidades de conservación y las reglas de visita vigentes (Itatiaia, Serra dos Órgãos, Iguaçu, Aparados da Serra, Pico da Neblina), con permiso de publicación.
> 2. Aclarar, para el Pico da Neblina, el papel del Ejército y de la Funai en la autorización de ascenso.
> 3. Informar si alguna unidad publica frecuencias de radio de uso público.


## 9. Ministério da Saúde (SUS / CNES)

**Asunto (PT):** Alcance da CC BY-ND 3.0 e guias de primeiros socorros

**Português**

> Prezados(as) do Ministério da Saúde,
>
> Contexto: Já carregamos o CNES com crédito; este pedido é para validar o critério.
>
> 1. Esclarecer o alcance da licença CC BY-ND 3.0 do CNES para um aplicativo que mostra os estabelecimentos em mapa/lista, filtrados por proximidade e tipo, sem alterar os valores e com crédito ao Ministério da Saúde: isso é «apresentar» e não «adaptar»?
> 2. Informar a permissão para usar guias de primeiros socorros do Ministério e o telefone vigente do CVB.
> 3. Enviar o «Dicionário de dados» completo do CNES (códigos TP_UNIDADE 15, 62 e 72 por confirmar).

**Español (para revisar)**

> Estimados/as de Ministério da Saúde:
>
> Contexto: Ya cargamos el CNES con crédito; este pedido es para validar el criterio.
>
> 1. Aclarar el alcance de la CC BY-ND 3.0 del CNES para una app que muestra los establecimientos en mapa/lista, filtrados por cercanía y tipo, sin alterar los valores y con crédito al Ministerio de Salud: ¿eso es «presentar» y no «adaptar»?
> 2. Informar el permiso para usar guías de primeros auxilios del Ministerio y el teléfono vigente del CVB.
> 3. Enviar el «Dicionário de dados» completo del CNES (códigos TP_UNIDADE 15, 62 y 72 por confirmar).


## 10. ANP

**Asunto (PT):** Licença real do CSV e coordenadas das revendas

**Português**

> Prezados(as) do ANP,
>
> Contexto: Comparamos a ANP com o OpenStreetMap em Foz do Iguaçu e Florianópolis; ainda não decidimos carregá-la.
>
> 1. Confirmar a licença (CC BY-ND 3.0?) do CSV de revendedores de combustíveis e informar se existe uma versão com coordenadas.
> 2. Perguntar se agregar coordenadas obtidas de outra fonte (OpenStreetMap) a um pin da ANP é permitido.

**Español (para revisar)**

> Estimados/as de ANP:
>
> Contexto: Comparamos la ANP con OpenStreetMap en Foz do Iguaçu y Florianópolis; todavía no decidimos cargarla.
>
> 1. Confirmar la licencia (¿CC BY-ND 3.0?) del CSV de revendedores de combustible y si existe una versión con coordenadas.
> 2. Preguntar si agregar coordenadas de otra fuente (OpenStreetMap) a un pin de la ANP está permitido.


## 11. MapBiomas

**Asunto (PT):** Licença definitiva

**Português**

> Prezados(as) do MapBiomas,
>
> Contexto: Hoje tratamos como CC BY, com crédito.
>
> 1. Confirmar a licença dos dados de cobertura e uso do solo (CC BY ou CC BY-SA) e a forma de atribuição desejada.

**Español (para revisar)**

> Estimados/as de MapBiomas:
>
> Contexto: Hoy lo tratamos como CC BY, con crédito.
>
> 1. Confirmar la licencia de los datos de cobertura y uso del suelo (CC BY o CC BY-SA) y la forma de atribución deseada.


## 12. INPE

**Asunto (PT):** Licença do TOPODATA e dos focos de calor; raios

**Português**

> Prezados(as) do INPE,
>
> Contexto: Já mostramos o risco de fogo, os dias sem chuva e o bioma do INPE, com crédito.
>
> 1. Informar a licença de redistribuição do TOPODATA e dos focos de calor do Programa Queimadas (CSV a cada 10 min), e as condições de uso.
> 2. Perguntar se há acesso, para uso não comercial, aos dados de raios (ELAT / BrasilDat).

**Español (para revisar)**

> Estimados/as de INPE:
>
> Contexto: Ya mostramos el riesgo de fuego, los días sin lluvia y el bioma del INPE, con crédito.
>
> 1. Informar la licencia de redistribución de TOPODATA y de los focos de calor del Programa Queimadas (CSV cada 10 min) y las condiciones de uso.
> 2. Preguntar si hay acceso, para uso no comercial, a los datos de rayos (ELAT / BrasilDat).


## 13. LABRE (Liga de Amadores Brasileiros de Rádio Emissão)

**Asunto (PT):** Repetidoras e frequências da RENER

**Português**

> Prezados(as) do LABRE,
>
> Contexto: Hoje mostramos apenas o que a LABRE e o MDR publicam, com crédito, e dizemos que as frequências de radioamador são para quem tem licença.
>
> 1. Solicitar uma lista vigente e oficial de repetidoras (indicativo, saída/deslocamento, tom CTCSS, cidade/UF, coordenadas, estado) e a permissão de publicá-la em um aplicativo gratuito, com crédito à LABRE e às LABRE estaduais.
> 2. Confirmar as frequências e bandas de chamada da RENER (o manual que circula, hospedado em qsl.net, não tem data nem vigência confirmada) e a frequência 146,520 MHz FM / TG 724193 DMR do comunicado de 23/07/2026.
> 3. Perguntar se existe um contato de cada LABRE estadual para manter os dados atualizados.

**Español (para revisar)**

> Estimados/as de LABRE:
>
> Contexto: Hoy mostramos solo lo que la LABRE y el MDR publican, con crédito, y decimos que las frecuencias de radioaficionado son para quien tiene licencia.
>
> 1. Pedir una lista vigente y oficial de repetidoras (indicativo, salida/desplazamiento, tono CTCSS, ciudad/UF, coordenadas, estado) y el permiso de publicarla en una app gratuita, con crédito a la LABRE y a las LABRE estaduales.
> 2. Confirmar las frecuencias y bandas de llamada de la RENER (el manual que circula, alojado en qsl.net, no tiene fecha ni vigencia confirmada) y la frecuencia 146,520 MHz FM / TG 724193 DMR del comunicado del 23/07/2026.
> 3. Preguntar si hay un contacto de cada LABRE estadual para mantener los datos al día.


## 14. Anatel

**Asunto (PT):** PX 27 MHz, FRS/PMR e códigos de emergência

**Português**

> Prezados(as) do Anatel,
>
> Contexto: Hoje mostramos os canais 9/11/19 da Res. 444/2006 com um aviso para confirmá-los.
>
> 1. Informar a norma técnica vigente de canalização do Rádio do Cidadão (27 MHz): a página diz Res. 772/2025, mas esse documento é o PDFF e consta como revogado; a Res. 444/2006 também aparece como revogada. Confirmar se o canal 9 (27,065 MHz) continua reservado a emergências, o 11 a chamada e o 19 a rodovias.
> 2. Informar se equipamentos FRS/PMR (462 e 446 MHz) são de uso livre no Brasil e em qual norma (Res. 680/2017, radiação restrita).
> 3. Informar a data de atualização da lista de códigos de emergência (a página diz «Modificado 22/06/2023») e se há uma versão em formato aberto.
> 4. Perguntar se há dados abertos de estações de radioamador (repetidoras) licenciadas, ou o procedimento formal para obtê-los, sem contornar o sistema de consulta.

**Español (para revisar)**

> Estimados/as de Anatel:
>
> Contexto: Hoy mostramos los canales 9/11/19 de la Res. 444/2006 con un aviso para confirmarlos.
>
> 1. Informar la norma técnica vigente de canalización del Rádio do Cidadão (27 MHz): la página dice Res. 772/2025, pero ese documento es el PDFF y figura como revocado; la Res. 444/2006 también figura como revocada. Confirmar si el canal 9 (27,065 MHz) sigue reservado a emergencias, el 11 a llamada y el 19 a rutas.
> 2. Informar si los equipos FRS/PMR (462 y 446 MHz) son de uso libre en Brasil y en qué norma (Res. 680/2017, radiación restringida).
> 3. Informar la fecha de actualización de la lista de códigos de emergencia (la página dice «Modificado 22/06/2023») y si hay una versión en formato abierto.
> 4. Preguntar si hay datos abiertos de estaciones de radioaficionado (repetidoras) licenciadas, o el procedimiento formal para obtenerlos, sin esquivar el sistema de consulta.

