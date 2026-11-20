# Each text question: (category, prompt, source, url, [ranked entries], [unlisted]).
# An entry is "Display label|alias|alias…". Order = rank (1 first).
C = {  # common country aliases
 "United States": "United States|USA|US|U.S.|U.S.A.|America|United States of America|the States",
 "United Kingdom": "United Kingdom|UK|U.K.|Britain|Great Britain|the United Kingdom",
 "DR Congo": "DR Congo|Democratic Republic of the Congo|DRC|D.R. Congo|Congo-Kinshasa|Congo Kinshasa|Zaire",
 "Congo": "Republic of the Congo|Congo-Brazzaville|Congo Brazzaville|Congo Republic",
 "Ivory Coast": "Côte d'Ivoire|Ivory Coast|Cote d'Ivoire|Cote dIvoire",
 "Eswatini": "Eswatini|Swaziland",
 "Cape Verde": "Cape Verde|Cabo Verde",
 "Sao Tome": "São Tomé and Príncipe|Sao Tome and Principe|Sao Tome|São Tomé",
 "CAR": "Central African Republic|CAR",
 "Czechia": "Czechia|Czech Republic",
 "UAE": "United Arab Emirates|UAE|U.A.E.|Emirates",
 "South Korea": "South Korea|Korea|Republic of Korea",
 "Netherlands": "Netherlands|Holland|the Netherlands",
 "Turkey": "Türkiye|Turkey|Turkiye",
 "PNG": "Papua New Guinea|PNG",
 "Gambia": "Gambia|The Gambia",
}
c = lambda n: C.get(n, n)

T = []

T.append(("Space","Name the #1 planet with the most known moons.",
 "NASA: Saturn 274 confirmed moons (IAU, March 2025), Jupiter 95, Uranus 29, Neptune 16, Mars 2, Earth 1","https://science.nasa.gov/saturn/moons/",
 ["Saturn","Jupiter","Uranus","Neptune","Mars","Earth"], ["Mercury","Venus","Pluto","Sun"]))

T.append(("Space","Name the #1 hottest planet in the Solar System.",
 "NASA planetary fact sheets: mean surface temperature Venus 464°C, Mercury 167°C, Earth 15°C, Mars −65°C…","https://nssdc.gsfc.nasa.gov/planetary/factsheet/",
 ["Venus","Mercury","Earth","Mars","Jupiter","Saturn","Uranus","Neptune"], ["Sun","Pluto"]))

T.append(("Space","Name the #1 largest moon in the Solar System.",
 "NASA, moon diameters: Ganymede 5,268 km, Titan 5,150 km, Callisto 4,821 km, Io 3,643 km, the Moon 3,475 km…","https://science.nasa.gov/solar-system/moons/",
 ["Ganymede","Titan","Callisto","Io","the Moon|Moon|Earth's moon|Luna|our moon","Europa","Triton","Titania","Rhea","Oberon","Iapetus","Charon","Umbriel","Ariel","Dione","Tethys","Enceladus","Miranda","Proteus","Mimas","Nereid","Hyperion","Phoebe","Phobos","Deimos"], ["Sun"]))

T.append(("Geography","Name the #1 largest country in Africa by area.",
 "CIA World Factbook, country areas: Algeria 2.38M km², DR Congo 2.34M, Sudan 1.86M, Libya 1.76M…","https://www.cia.gov/the-world-factbook/field/area/country-comparison/",
 ["Algeria",c("DR Congo"),"Sudan","Libya","Chad","Niger","Angola","Mali","South Africa","Ethiopia","Mauritania","Egypt","Tanzania","Nigeria","Namibia","Mozambique","Zambia","South Sudan","Somalia",c("CAR"),"Madagascar","Botswana","Kenya","Cameroon","Morocco","Zimbabwe",c("Congo"),c("Ivory Coast"),"Burkina Faso","Gabon","Guinea","Uganda","Ghana","Senegal","Tunisia","Malawi","Eritrea","Benin","Liberia","Sierra Leone","Togo","Guinea-Bissau","Lesotho","Equatorial Guinea","Burundi","Rwanda","Djibouti",c("Eswatini"),c("Gambia"),c("Cape Verde"),"Comoros","Mauritius",c("Sao Tome"),"Seychelles"], ["Africa","Sahara"]))

T.append(("Geography","Name the #1 most populous country in Africa.",
 "United Nations, World Population Prospects 2024: Nigeria 232M, Ethiopia 132M, Egypt 116M, DR Congo 109M…","https://population.un.org/wpp/",
 ["Nigeria","Ethiopia","Egypt",c("DR Congo"),"Tanzania","South Africa","Kenya","Sudan","Uganda","Algeria","Morocco","Angola","Mozambique","Ghana","Madagascar",c("Ivory Coast"),"Cameroon","Niger","Mali","Burkina Faso","Malawi","Zambia","Chad","Somalia","Senegal","Zimbabwe","Guinea","Benin","Rwanda","Burundi","Tunisia","South Sudan","Togo","Sierra Leone","Libya",c("Congo"),"Liberia",c("CAR"),"Mauritania","Eritrea","Namibia",c("Gambia"),"Botswana","Gabon","Lesotho","Guinea-Bissau","Equatorial Guinea","Mauritius",c("Eswatini"),"Djibouti","Comoros",c("Cape Verde"),c("Sao Tome"),"Seychelles"], ["Africa"]))

T.append(("Geography","Name the #1 most populous country in the European Union.",
 "Eurostat, Population on 1 January 2024: Germany 83.4M, France 68.4M, Italy 59.0M, Spain 48.6M, Poland 36.6M…","https://ec.europa.eu/eurostat/web/population-demography",
 ["Germany","France","Italy","Spain","Poland","Romania",c("Netherlands"),"Belgium",c("Czechia"),"Portugal","Sweden","Greece","Hungary","Austria","Bulgaria","Denmark","Finland","Slovakia","Ireland","Croatia","Lithuania","Slovenia","Latvia","Estonia","Cyprus","Luxembourg","Malta"], ["Russia",c("United Kingdom"),"Ukraine",c("Turkey"),"Norway","Switzerland","England"]))

T.append(("Geography","Name the #1 largest country entirely within Europe, by area.",
 "CIA World Factbook areas (countries wholly in Europe; Russia, Turkey and Kazakhstan span two continents): Ukraine 603,550 km², France (metropolitan) 551,500 km², Spain 505,370 km²…","https://www.cia.gov/the-world-factbook/field/area/country-comparison/",
 ["Ukraine","France","Spain","Sweden","Germany","Finland","Norway","Poland","Italy",c("United Kingdom"),"Romania","Belarus","Greece","Bulgaria","Iceland","Hungary","Portugal","Austria",c("Czechia"),"Serbia","Ireland","Lithuania","Latvia","Croatia","Bosnia and Herzegovina|Bosnia","Slovakia","Estonia","Denmark",c("Netherlands"),"Switzerland","Moldova","Belgium","Albania","North Macedonia|Macedonia","Slovenia","Montenegro","Kosovo","Luxembourg","Andorra","Malta","Liechtenstein","San Marino","Monaco","Vatican City|Vatican|Holy See"], ["Russia",c("Turkey"),"Kazakhstan","England","Scotland"]))

T.append(("Geography","Name the #1 smallest country in the world by area.",
 "CIA World Factbook, country areas: Vatican City 0.44 km², Monaco 2 km², Nauru 21 km², Tuvalu 26 km², San Marino 61 km²…","https://www.cia.gov/the-world-factbook/field/area/country-comparison/",
 ["Vatican City|Vatican|Holy See","Monaco","Nauru","Tuvalu","San Marino","Liechtenstein","Marshall Islands","Saint Kitts and Nevis|St Kitts and Nevis|St. Kitts","Maldives","Malta","Grenada","Saint Vincent and the Grenadines|St Vincent","Barbados","Antigua and Barbuda|Antigua","Seychelles","Palau","Andorra","Saint Lucia|St Lucia","Micronesia|Federated States of Micronesia","Singapore","Tonga","Dominica","Bahrain","Kiribati",c("Sao Tome"),"Comoros","Mauritius","Luxembourg","Samoa",c("Cape Verde")], ["Gibraltar","Puerto Rico","Hong Kong","Macau"]))

T.append(("Geography","Name the #1 country with the longest coastline.",
 "CIA World Factbook, Coastline: Canada 202,080 km, Indonesia 54,716 km, Russia 37,653 km, Philippines 36,289 km, Japan 29,751 km…","https://www.cia.gov/the-world-factbook/field/coastline/",
 ["Canada","Indonesia","Russia","Philippines","Japan","Australia","Norway",c("United States"),"New Zealand","China","Greece",c("United Kingdom"),"Mexico","Italy","Brazil","Denmark",c("Turkey"),"India","Chile","Croatia",c("PNG"),"Argentina","Iceland","Spain","France","Madagascar","Malaysia","Estonia","Cuba","Vietnam","Thailand","Sweden","Somalia","Saudi Arabia","Bahamas|The Bahamas","Ireland","Peru","Colombia","Ecuador","Fiji"], ["Greenland","Antarctica"]))

T.append(("Geography","Name the #1 largest desert in the world.",
 "Wikipedia, List of deserts by area (incl. polar deserts): Antarctic 14.2M km², Arctic 13.9M km², Sahara 9.2M km²…","https://en.wikipedia.org/wiki/List_of_deserts_by_area",
 ["Antarctic Desert|Antarctic|Antarctica|Antarctic polar desert","Arctic Desert|Arctic|Arctic polar desert","Sahara|Sahara Desert","Arabian Desert|Arabian","Gobi|Gobi Desert","Kalahari|Kalahari Desert","Patagonian Desert|Patagonia|Patagonian","Syrian Desert|Syrian","Great Basin Desert|Great Basin","Chihuahuan Desert|Chihuahuan","Great Victoria Desert|Great Victoria","Karakum Desert|Karakum","Colorado Plateau","Sonoran Desert|Sonoran","Kyzylkum Desert|Kyzylkum","Great Sandy Desert|Great Sandy","Taklamakan Desert|Taklamakan|Taklimakan","Thar Desert|Thar","Gibson Desert|Gibson","Mojave Desert|Mojave","Atacama Desert|Atacama","Namib Desert|Namib"], []))

T.append(("Geography","Name the #1 largest island in the world.",
 "Encyclopaedia Britannica / Wikipedia, islands by area: Greenland 2.13M km², New Guinea 786,000 km², Borneo 743,000 km²… (Australia counts as a continent)","https://en.wikipedia.org/wiki/List_of_islands_by_area",
 ["Greenland","New Guinea","Borneo","Madagascar","Baffin Island|Baffin","Sumatra","Honshu|Honshū","Victoria Island","Great Britain|Britain","Ellesmere Island|Ellesmere","Sulawesi|Celebes","South Island|South Island New Zealand","Java","North Island|North Island New Zealand","Luzon","Newfoundland","Cuba","Iceland","Mindanao","Ireland","Hokkaido|Hokkaidō","Hispaniola","Sakhalin","Banks Island","Sri Lanka","Tasmania","Devon Island","Alexander Island","Tierra del Fuego|Isla Grande de Tierra del Fuego","Severny Island"], ["Australia","Antarctica"]))

T.append(("Geography","Name the #1 most populous island in the world.",
 "Wikipedia, List of islands by population (national census data): Java ~156M, Honshu ~104M, Great Britain ~66M, Luzon ~64M, Sumatra ~60M…","https://en.wikipedia.org/wiki/List_of_islands_by_population",
 ["Java","Honshu|Honshū","Great Britain|Britain","Luzon","Sumatra","Madagascar","Mindanao","Hispaniola","Borneo","Taiwan","Sri Lanka","Sulawesi|Celebes","New Guinea","Kyushu|Kyūshū","Cuba","Hainan","Long Island","Ireland","Singapore|Singapore Island","Hokkaido|Hokkaidō","Negros","Panay","Cebu","Shikoku","Puerto Rico","Bali","Lombok","North Island|North Island New Zealand","Sicily"], ["Australia","Greenland","Japan","Indonesia","Philippines","Manhattan"]))

T.append(("Geography","Name the #1 longest river in the United States.",
 "USGS, Largest Rivers in the United States (length): Missouri 2,341 mi, Mississippi 2,202 mi, Yukon 1,979 mi, Rio Grande 1,900 mi…","https://pubs.usgs.gov/of/1987/ofr87-242/",
 ["Missouri River|Missouri","Mississippi River|Mississippi","Yukon River|Yukon","Rio Grande","St. Lawrence River|St Lawrence|Saint Lawrence","Arkansas River|Arkansas","Colorado River|Colorado","Atchafalaya River|Atchafalaya","Ohio River|Ohio","Red River|Red","Brazos River|Brazos","Columbia River|Columbia","Snake River|Snake","Platte River|Platte","Pecos River|Pecos","Canadian River|Canadian","Tennessee River|Tennessee","North Canadian River|North Canadian","Mobile River|Mobile","Kansas River|Kansas","Kuskokwim River|Kuskokwim","Yellowstone River|Yellowstone","Tanana River|Tanana","Gila River|Gila","Milk River|Milk","Ouachita River|Ouachita","Cumberland River|Cumberland","Hudson River|Hudson","Potomac River|Potomac","Sacramento River|Sacramento"], ["Nile","Amazon"]))

T.append(("Geography","Name the #1 longest river in Europe.",
 "Encyclopaedia Britannica / Wikipedia, rivers of Europe by length: Volga 3,530 km, Danube 2,850 km, Ural 2,428 km, Dnieper 2,201 km…","https://en.wikipedia.org/wiki/List_of_rivers_of_Europe",
 ["Volga","Danube","Ural","Dnieper","Don","Pechora","Kama","Oka","Belaya","Dniester","Rhine","Elbe","Vistula","Daugava|Western Dvina","Loire","Tagus|Tajo|Tejo","Meuse|Maas","Ebro","Oder","Rhône|Rhone","Seine","Douro|Duero","Po","Garonne","Northern Dvina","Neman|Nemunas","Mures|Mureș","Tisza","Shannon","Thames"], ["Nile","Amazon"]))

T.append(("Geography","Name the #1 US state with the most people per square mile.",
 "US Census Bureau, 2020 Census population density by state: New Jersey 1,263/sq mi, Rhode Island 1,061, Massachusetts 901, Connecticut 745, Maryland 636…","https://www.census.gov/data/tables/time-series/dec/density-data-text.html",
 ["New Jersey|NJ","Rhode Island|RI","Massachusetts|MA|Mass","Connecticut|CT","Maryland|MD","Delaware|DE","New York|NY|New York State","Florida|FL","Pennsylvania|PA","Ohio|OH","California|CA|Cali","Illinois|IL","Hawaii|HI","Virginia|VA","North Carolina|NC","Indiana","Georgia|GA","Michigan|MI","South Carolina|SC","Tennessee|TN","New Hampshire|NH","Washington|WA|Washington State","Kentucky|KY","Texas|TX","Wisconsin|WI","Louisiana|LA","Alabama|AL","Missouri|MO","West Virginia|WV","Minnesota|MN","Vermont|VT","Arizona|AZ","Mississippi|MS","Arkansas|AR","Oklahoma|OK","Iowa|IA","Colorado|CO","Oregon","Maine|ME","Utah|UT","Kansas|KS","Nevada|NV","Nebraska|NE","Idaho|ID","New Mexico|NM","South Dakota|SD","North Dakota|ND","Montana|MT","Wyoming|WY","Alaska|AK"], ["Washington DC","District of Columbia","DC","Puerto Rico"]))

T.append(("Geography","Name the #1 least populous US state.",
 "US Census Bureau, Vintage 2024 population estimates: Wyoming 587,618, Vermont 648,493, Alaska 740,133, North Dakota 796,568…","https://www.census.gov/data/tables/time-series/demo/popest/2020s-state-total.html",
 ["Wyoming|WY","Vermont|VT","Alaska|AK","North Dakota|ND","South Dakota|SD","Delaware|DE","Rhode Island|RI","Montana|MT","Maine|ME","New Hampshire|NH","Hawaii|HI","West Virginia|WV","Idaho|ID","Nebraska|NE","New Mexico|NM","Mississippi|MS","Kansas|KS","Arkansas|AR","Iowa|IA","Nevada|NV","Utah|UT","Connecticut|CT","Oklahoma|OK","Oregon","Kentucky|KY","Louisiana|LA","Alabama|AL","South Carolina|SC","Minnesota|MN","Colorado|CO","Wisconsin|WI","Missouri|MO","Maryland|MD","Indiana","Massachusetts|MA|Mass","Tennessee|TN","Arizona|AZ","Washington|WA|Washington State","Virginia|VA","New Jersey|NJ","Michigan|MI","North Carolina|NC","Georgia|GA","Ohio|OH","Illinois|IL","Pennsylvania|PA","New York|NY|New York State","Florida|FL","Texas|TX","California|CA|Cali"], ["Washington DC","District of Columbia","DC","Puerto Rico","Guam"]))

T.append(("Geography","Name the #1 most populous US state capital.",
 "US Census Bureau, Vintage 2023 city population estimates: Phoenix 1.65M, Austin 979,882, Columbus 913,175, Indianapolis 879,293, Denver 716,577…","https://www.census.gov/data/tables/time-series/demo/popest/2020s-total-cities-and-towns.html",
 ["Phoenix","Austin","Columbus","Indianapolis|Indy","Denver","Oklahoma City|OKC","Nashville","Boston","Sacramento","Atlanta","Raleigh","Honolulu","Saint Paul|St. Paul|St Paul","Lincoln","Madison","Boise","Richmond","Baton Rouge","Des Moines","Salt Lake City|SLC","Little Rock","Tallahassee","Montgomery","Providence","Salem","Jackson","Columbia","Topeka","Hartford","Springfield","Lansing","Albany","Trenton","Santa Fe","Bismarck","Cheyenne","Carson City","Olympia","Harrisburg","Charleston","Concord","Jefferson City","Annapolis","Dover","Helena","Juneau","Frankfort","Augusta","Pierre","Montpelier"], ["Washington DC","Washington","New York City","Los Angeles","Houston","Chicago"]))

T.append(("Geography","Name the #1 most visited US national park.",
 "National Park Service visitor statistics, 2024 recreation visits: Great Smoky Mountains 12.2M, Zion 4.9M, Grand Canyon 4.9M, Yellowstone 4.7M, Rocky Mountain 4.2M…","https://irma.nps.gov/Stats/",
 ["Great Smoky Mountains|Smoky Mountains|the Smokies|Great Smokies|Smokies","Zion","Grand Canyon","Yellowstone","Rocky Mountain|Rocky Mountains|Rockies","Yosemite","Acadia","Grand Teton|Tetons|Grand Tetons","Olympic","Glacier","Joshua Tree","Cuyahoga Valley","Indiana Dunes","Bryce Canyon|Bryce","Hot Springs","Arches","Hawaii Volcanoes|Hawaiʻi Volcanoes|Volcanoes","Gateway Arch|St. Louis Arch","Shenandoah","Mount Rainier|Rainier","Sequoia","Capitol Reef","Haleakala|Haleakalā","Death Valley","Badlands","Everglades","Saguaro","Kings Canyon","Mammoth Cave","Canyonlands","Theodore Roosevelt","Big Bend","Crater Lake","Petrified Forest","Redwood|Redwoods","White Sands","Mesa Verde","Carlsbad Caverns|Carlsbad","Lassen Volcanic|Lassen","New River Gorge","Wind Cave","Biscayne","Great Sand Dunes","Pinnacles","Glacier Bay","Denali","Black Canyon of the Gunnison|Black Canyon","Voyageurs","Congaree","Channel Islands","Guadalupe Mountains","Great Basin","Virgin Islands","Dry Tortugas","Kenai Fjords","North Cascades","Isle Royale","Katmai","Wrangell-St. Elias|Wrangell St Elias|Wrangell","American Samoa","Lake Clark","Kobuk Valley","Gates of the Arctic"], ["Golden Gate","Central Park","Blue Ridge Parkway","Statue of Liberty","Mount Rushmore","Niagara Falls"]))

T.append(("Geography","Name the #1 busiest airport in the world by passengers.",
 "Airports Council International, World's busiest airports 2024: Atlanta 108.1M, Dubai 92.3M, Dallas Fort Worth 87.8M, Tokyo Haneda 85.9M, London Heathrow 83.9M…","https://aci.aero/2025/07/08/worlds-busiest-airports-revealed-in-final-global-rankings/",
 ["Atlanta|Hartsfield-Jackson|ATL|Hartsfield Jackson Atlanta|Atlanta airport","Dubai|DXB|Dubai International","Dallas Fort Worth|DFW|Dallas","Tokyo Haneda|Haneda|HND","London Heathrow|Heathrow|LHR","Denver|DEN","Istanbul|IST|Istanbul Airport","Chicago O'Hare|O'Hare|ORD|Ohare","Delhi|New Delhi|DEL|Indira Gandhi","Shanghai Pudong|Pudong|PVG","Los Angeles|LAX","Guangzhou|CAN|Guangzhou Baiyun","Paris Charles de Gaulle|Charles de Gaulle|CDG","Seoul Incheon|Incheon|ICN","Amsterdam Schiphol|Schiphol|Amsterdam|AMS","Singapore Changi|Changi|Singapore|SIN","Madrid|Barajas|MAD","Frankfurt|FRA","New York JFK|JFK|John F. Kennedy","Charlotte|CLT","Beijing Capital|Beijing|PEK","Bangkok Suvarnabhumi|Suvarnabhumi|Bangkok|BKK","Las Vegas|Harry Reid|LAS","Orlando|MCO","Miami|MIA","Mumbai|BOM","Jakarta|Soekarno-Hatta|CGK","Hong Kong|HKG","Doha|Hamad|DOH","Mexico City|MEX"], ["Tokyo Narita","Narita","London Gatwick","Gatwick","Newark","LaGuardia"]))

T.append(("Geography","Name the #1 largest metropolitan area in South America by population.",
 "UN World Urbanization Prospects / national statistics offices (IBGE, INDEC, INEI, DANE): São Paulo ~22M, Buenos Aires ~15M, Rio de Janeiro ~13M, Lima ~11M, Bogotá ~11M…","https://population.un.org/wup/",
 ["São Paulo|Sao Paulo|SP","Buenos Aires","Rio de Janeiro|Rio","Lima","Bogotá|Bogota","Santiago","Belo Horizonte","Brasília|Brasilia","Caracas","Porto Alegre","Recife","Fortaleza","Salvador","Medellín|Medellin","Guayaquil","Curitiba","Campinas","Cali","Quito","Maracaibo","Barranquilla","Goiânia|Goiania","Belém|Belem","Manaus","Asunción|Asuncion","Montevideo","La Paz","Santa Cruz|Santa Cruz de la Sierra","Valencia","Córdoba|Cordoba"], ["Mexico City","Brazil","Argentina"]))

T.append(("Geography","Name the #1 most populous province or territory in Canada.",
 "Statistics Canada, population estimates (2024): Ontario 16.1M, Quebec 9.0M, British Columbia 5.7M, Alberta 4.9M…","https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000901",
 ["Ontario|ON","Quebec|Québec|QC","British Columbia|BC","Alberta|AB","Manitoba|MB","Saskatchewan|SK","Nova Scotia|NS","New Brunswick|NB","Newfoundland and Labrador|Newfoundland|NL","Prince Edward Island|PEI","Yukon|YT","Northwest Territories|NWT","Nunavut|NU"], ["Toronto","Vancouver","Montreal"]))

T.append(("Geography","Name the #1 most populous state or territory in Australia.",
 "Australian Bureau of Statistics, National, state and territory population (2024): New South Wales 8.5M, Victoria 7.0M, Queensland 5.6M…","https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/latest-release",
 ["New South Wales|NSW","Victoria|VIC","Queensland|QLD","Western Australia|WA","South Australia|SA","Tasmania|TAS","Australian Capital Territory|ACT|Canberra","Northern Territory|NT"], ["Sydney","Melbourne"]))

T.append(("Science","Name the #1 most abundant element in the human body by mass.",
 "OpenStax Anatomy & Physiology / Encyclopaedia Britannica: oxygen ~65%, carbon ~18.5%, hydrogen ~9.5%, nitrogen ~3.2%, calcium ~1.5%…","https://openstax.org/books/anatomy-and-physiology-2e/pages/2-1-elements-and-atoms-the-building-blocks-of-matter",
 ["Oxygen","Carbon","Hydrogen","Nitrogen","Calcium|Ca","Phosphorus","Potassium","Sulfur|Sulphur","Sodium|Na","Chlorine|Cl","Magnesium|Mg","Iron|Fe","Fluorine","Zinc|Zn","Silicon|Si","Copper|Cu","Iodine","Selenium|Se","Manganese|Mn","Cobalt|Co"], ["Water","Protein","Gold","Helium"]))

T.append(("Business","Name the #1 country that produces the most coffee.",
 "USDA Foreign Agricultural Service, Coffee: World Markets and Trade (2024/25): Brazil, Vietnam, Colombia, Indonesia, Ethiopia…","https://www.fas.usda.gov/data/coffee-world-markets-and-trade",
 ["Brazil","Vietnam","Colombia","Indonesia","Ethiopia","Honduras","Uganda","Peru","India","Mexico","Guatemala","Nicaragua","Laos","China","Costa Rica",c("Ivory Coast"),"Tanzania","Kenya",c("PNG"),"El Salvador","Thailand","Venezuela","Ecuador","Cameroon","Philippines","Madagascar","Dominican Republic","Haiti","Bolivia","Rwanda","Burundi","Yemen","Guinea","Togo","Sierra Leone","Panama","Zambia","Malawi","Zimbabwe","Jamaica","Cuba",c("DR Congo"),c("CAR"),"Angola","Nepal","Myanmar","Sri Lanka","Timor-Leste|East Timor",c("United States")], ["Starbucks","Italy"]))

T.append(("Business","Name the #1 country that produces the most oil.",
 "US Energy Information Administration, total petroleum and other liquids production (2024): United States ~22M barrels/day, Saudi Arabia, Russia, Canada, China…","https://www.eia.gov/international/rankings/world",
 [c("United States"),"Saudi Arabia","Russia","Canada","China","Iraq","Brazil",c("UAE"),"Iran","Kuwait","Mexico","Kazakhstan","Norway","Qatar","Nigeria","Algeria","Libya","Angola","Oman","Colombia","Argentina","Guyana","Venezuela","Indonesia","India","Malaysia","Egypt","Azerbaijan","Ecuador",c("United Kingdom")], ["OPEC","Texas","Dubai"]))

T.append(("Business","Name the #1 biggest company in the world by revenue.",
 "Fortune Global 500 (2025): Walmart $681B, Amazon $638B, State Grid $548B, Saudi Aramco $480B, China National Petroleum…","https://fortune.com/ranking/global500/",
 ["Walmart","Amazon","State Grid|State Grid Corporation of China","Saudi Aramco|Aramco","China National Petroleum|CNPC|PetroChina","Sinopec|China Petrochemical","UnitedHealth|UnitedHealth Group","Apple","CVS|CVS Health","Berkshire Hathaway|Berkshire","Volkswagen|VW","ExxonMobil|Exxon|Exxon Mobil","Alphabet|Google","McKesson","Toyota","Shell","Cencora|AmerisourceBergen","China State Construction|China State Construction Engineering","Microsoft","Costco","JPMorgan Chase|JPMorgan|Chase","Glencore","Trafigura","Samsung|Samsung Electronics","Industrial and Commercial Bank of China|ICBC","Cardinal Health","Chevron","Cigna","Stellantis","Ford|Ford Motor"], ["Nvidia","Tesla","Meta","Facebook"]))

T.append(("Pop culture","Name the #1 best-selling music artist of all time.",
 "Wikipedia, List of best-selling music artists (claimed sales): The Beatles, Elvis Presley, Michael Jackson, Elton John, Queen, Madonna, Led Zeppelin, Rihanna…","https://en.wikipedia.org/wiki/List_of_best-selling_music_artists",
 ["The Beatles|Beatles","Elvis Presley|Elvis","Michael Jackson|MJ","Elton John","Queen","Madonna","Led Zeppelin","Rihanna","Pink Floyd","Eminem","Taylor Swift","Mariah Carey","Celine Dion|Céline Dion","Garth Brooks","AC/DC|ACDC","Whitney Houston","The Rolling Stones|Rolling Stones","Drake","Bruno Mars","Kanye West|Ye","Justin Bieber","Bee Gees","ABBA","Frank Sinatra","Billy Joel","Barbra Streisand","U2","Bon Jovi","Metallica","Beyoncé|Beyonce"], ["Mozart","Beethoven"]))

T.append(("Pop culture","Name the #1 highest-grossing Pixar movie of all time.",
 "Box Office Mojo, Pixar worldwide grosses: Inside Out 2 $1.70B, Incredibles 2 $1.24B, Toy Story 4 $1.07B, Toy Story 3 $1.07B, Finding Dory $1.03B…","https://www.boxofficemojo.com/brand/bn3976141826/",
 ["Inside Out 2","Incredibles 2|The Incredibles 2","Toy Story 4","Toy Story 3","Finding Dory","Finding Nemo","Inside Out","Coco","Monsters University","Up","The Incredibles|Incredibles","Ratatouille","Monsters, Inc.|Monsters Inc","Cars 2","Brave","WALL-E|Wall-E|Walle","Toy Story 2","Elemental","Cars","Toy Story","Cars 3","A Bug's Life|Bugs Life","The Good Dinosaur|Good Dinosaur","Lightyear","Elio","Onward","Soul","Luca","Turning Red"], ["Frozen","Shrek","Zootopia","Moana","The Lion King","Despicable Me","Minions"]))
