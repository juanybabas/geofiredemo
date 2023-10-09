var sentinel = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
                .filterDate('2019-07-01','2019-07-31')
                .filterBounds(pau)
print(sentinel)
function maskS2sr(image) {
  // Los bits 10 y 11 son nubes y cirros, respectivamente.
  var cloudBitMask = ee.Number(2).pow(10).int();
  var cirrusBitMask = ee.Number(2).pow(11).int();
  // Obtenga la banda QA de control de calidad de píxeles.
  var qa = image.select('QA60');
  // Todos los indicadores deben establecerse en cero, lo que indica condiciones limpias o 
  // libres de nubes.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  // Devuelve la imagen enmascarada y escalada a la reflectancia TOA, sin las bandas de QA.
  return image.updateMask(mask)
      .copyProperties(image, ["system:time_start"]);
}
var prefire_CM_ImCol = sentinel.map(maskS2sr)
print(prefire_CM_ImCol)
var pre_mos = ee.Image('COPERNICUS/S2_HARMONIZED/20190729T145739_20190729T150547_T19LBF').clip(pau)
var post_cm_mos = ee.Image('COPERNICUS/S2_HARMONIZED/20200529T145731_20200529T150217_T19LBF').clip(pau)
//Map.addLayer(image,imageVisParam,'sentinel')

var preNBR = pre_mos.normalizedDifference(['B8', 'B12']);
var postNBR = post_cm_mos.normalizedDifference(['B8', 'B12']);

var dNBR_unscaled = preNBR.subtract(postNBR);
print(dNBR_unscaled);
// Escale el producto a los estándares del USGS (FIREMON)
var dNBR = dNBR_unscaled.multiply(1000);
print(dNBR);
//añadir el area de estudio
Map.addLayer(pau.style( {
  fillColor: 'b5ffb4',
  color: '00909F',
  width: 1.0,
}), {},'Área de estudio');

var vis = {bands: ['B4', 'B3', 'B2'], max: 2000, gamma: 1.5}

var grey = ['white', 'black'];

Map.addLayer(dNBR, {min: -1000, max: 1000, palette: grey}, 'dNBR en escala de grises');

// Define un estilo SLD de intervalos discretos para aplicar a la imagen (paleta de color).
var sld_intervals =
  '<RasterSymbolizer>' +
    '<ColorMap type="intervals" extended="false" >' +
      '<ColorMapEntry color="#ffffff" quantity="-500" label="-500"/>' +
      '<ColorMapEntry color="#7a8737" quantity="-250" label="-250" />' +
      '<ColorMapEntry color="#acbe4d" quantity="-100" label="-100" />' +
      '<ColorMapEntry color="#0ae042" quantity="100" label="100" />' +
      '<ColorMapEntry color="#fff70b" quantity="270" label="270" />' +
      '<ColorMapEntry color="#ffaf38" quantity="440" label="440" />' +
      '<ColorMapEntry color="#ff641b" quantity="660" label="660" />' +
      '<ColorMapEntry color="#FF0000" quantity="2000" label="2000" />' +
    '</ColorMap>' +
  '</RasterSymbolizer>';
  // Agregua la imagen al mapa utilizando la rampa de color como los intervalo definidos.
Map.addLayer(dNBR.sldStyle(sld_intervals), {}, 'dNBR clasificado');

// Separa el resultado en 8 clases de severidad del incendio.
var thresholds = ee.Image([-1000, -251, -101, 99, 269, 439, 659, 2000]);
var classified = dNBR.lt(thresholds).reduce('sum').toInt();

//==========================================================================================
//                          AGREGAR ESTADÍSTICAS DE ÁREA QUEMADA

// cunta el número de píxeles en toda la capa.
var allpix =  classified.updateMask(classified);  // enmascara toda la capa
var pixstats = allpix.reduceRegion({
  reducer: ee.Reducer.count(),               // cuenta píxeles en una sola clase
  geometry: pau,
  scale: 30
  });
var allpixels = ee.Number(pixstats.get('sum')); // extrae el recuento de píxeles como un número


// crea una lista vacía para almacenar los valores en área
var arealist = [];

// crea una función para derivar el alcance de una clase de severidad del incendio
// los argumentos son número de clase y nombre de clase
var areacount = function(cnr, name) {
 var singleMask =  classified.updateMask(classified.eq(cnr));  // enmascara una sola clase
 var stats = singleMask.reduceRegion({
  reducer: ee.Reducer.count(),               // cuenta los píxeles en una sola clase
  geometry: pau,
  scale: 30
  });
var pix =  ee.Number(stats.get('sum'));
var hect = pix.multiply(900).divide(10000);                // Pixel Landsat = 30m x 30m -> 900 m2
var perc = pix.divide(allpixels).multiply(10000).round().divide(100);   // obtiene el % de área por clase y redondea a 2 decimales
arealist.push({Class: name, Pixels: pix, Hectares: hect, Percentage: perc});
};

// clases de severidad en orden ascendente.
var names2 = ['NA', 'High Severity', 'Moderate-High Severity',
'Moderate-Low Severity', 'Low Severity','Unburned', 'Enhanced Regrowth-low(post-fire)', 'Enhanced Regrowth-high(post-fire)'];

// ejecuta la función para cada clase
for (var i = 0; i < 8; i++) {
  areacount(i, names2[i]);
  }

print('Área quemada por clase de Severidad', arealist, '--> haga clic en la lista de objetos para ver las clases individuales');

//==========================================================================================
//                                    AGREGAR UNA LEYENDA

// establece la posición del recuadro de leyenda.
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }});
 
// Crea un título de leyenda.
var legendTitle = ui.Label({
  value: 'dNBR Classes',
  style: {fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
    }});
 
// Agregua el título al recuadro.
legend.add(legendTitle);
 
// Crea y estiliza 1 fila de la leyenda.
var makeRow = function(color, name) {
 
      // Crea la etiqueta que en realidad es el cuadro de color.
      var colorBox = ui.Label({
        style: {
          backgroundColor: '#' + color,
          // Usa (padding) para rellenoar y dar la altura y el ancho de la caja.
          padding: '8px',
          margin: '0 0 4px 0'
        }});
 
      // Crea la etiqueta llena con el texto descriptivo.
      var description = ui.Label({
        value: name,
        style: {margin: '0 0 4px 6px'}
      });
 
      // devuelve el panel
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      })};
 
//  Paleta de colores
var palette =['7a8737', 'acbe4d', '0ae042', 'fff70b', 'ffaf38', 'ff641b', 'FF0000', 'ffffff'];
 
// Nombre de la leyenda
var names = ['Enhanced Regrowth-high(post-fire)','Enhanced Regrowth-low(post-fire)','Unburned', 'Low Severity',
'Moderate-Low Severity', 'Moderate-High Severity', 'High Severity', 'NA'];
 
// Agregua color y nombres
for (var i = 0; i < 8; i++) {
  legend.add(makeRow(palette[i], names[i]));
  }  
 
// Agrega la leyenda al mapa (también se puede imprimir la leyenda en la consola)
//Map.add(legend);
ui.root.add(legend)

var classTitle = ui.Label({
  value: 'Area burned by severity class',
  style: {fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
    }});
 
legend.add(classTitle)
