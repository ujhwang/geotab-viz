// Your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoidWpod2FuZyIsImEiOiJjbHl4N2h5cTQxeXU1MmpvaWZ5bXNjdHpjIn0.gcfpTq4jsVV2E9yULpcJWQ';

// Create the map
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v10',
    center: [-83.8680, 33.8290], // Atlanta metro region
    zoom: 9
});

// Define the color array for the map
const colors = [
    '#5c5c5c', '#1f0c48', '#550f6d', '#88226a', '#a83659',
    '#cb5046', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4', '#feffde'
];

// Define the color array for road types
const roadTypeColors = {
    motorway: '#003f5c',
    trunk: '#bc5090',
    primary: '#ffa600'
};

// Global variable to track the current column for the y-axis range
let currentColumn = 'ObservedCount';

// Maximum y-value for the bar chart, initialized to 0
let maxY = 0;

// Maximum x-value for the horizontal bar chart, initialized to 0
let maxX = 0;

// Function to calculate percentiles
function calculatePercentiles(values) {
    if (values.length === 0) return [];
    values.sort((a, b) => a - b);
    const percentiles = [];
    for (let i = 0; i <= 100; i += 10) {
        const index = Math.floor((i / 100) * (values.length - 1));
        percentiles.push(values[index]);
    }
    return percentiles;
}

// Function to get selected road types
function getSelectedRoadTypes() {
    const roadTypes = [];
    if (document.getElementById('motorway-checkbox').checked) roadTypes.push('motorway');
    if (document.getElementById('trunk-checkbox').checked) roadTypes.push('trunk');
    if (document.getElementById('primary-checkbox').checked) roadTypes.push('primary');
    return roadTypes;
}

// Load the CSV data and initialize visualization
let csvData = {};
d3.csv("data/count/truck_counts.csv").then(function(data) {
    data.forEach(d => {
        csvData[d.SegmentId] = d;
    });

    // Initial load
    map.on('load', function () {
        map.addSource('my-vector-tiles', {
            type: 'vector',
            url: 'mapbox://ujhwang.7vny7cop'
        });

        map.addLayer({
            'id': 'truck-count-layer',
            'type': 'line',
            'source': 'my-vector-tiles',
            'source-layer': 'osm_light',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#5c5c5c',
                'line-width': 3
            }
        });

        // Load GeoJSON data and add to map
        d3.json('data/geojson/22_counties.geojson').then(function(geojsonData) {
            map.addSource('counties', {
                type: 'geojson',
                data: geojsonData
            });

            map.addLayer({
                'id': 'counties-layer',
                'type': 'line',
                'source': 'counties',
                'paint': {
                    'line-color': '#a3a2a2',
                    'line-width': 1,
                    'line-dasharray': [2,2]
                }
            });

            // Ensure features are queried after the source is loaded
            map.once('idle', function() {
                const features = map.querySourceFeatures('my-vector-tiles', {
                    sourceLayer: 'osm_light'
                });

                if (features.length > 0) {
                    // Initial map and bar chart update
                    updateMap('ObservedCount');
                    updateMaxY('ObservedCount');
                    updateMaxX('Month_'); // Update maxX with the initial column prefix
                } else {
                    console.error('No features found in the specified source layer.');
                }
            });
        });
    });
});

// Function to update the map visualization
function updateMap(column) {
    const selectedRoadTypes = getSelectedRoadTypes();

    const filterExpression = ['in', ['get', 'RoadType'], ['literal', selectedRoadTypes]];

    const features = map.querySourceFeatures('my-vector-tiles', {
        sourceLayer: 'osm_light'
    });

    if (!features || features.length === 0) {
        console.error('No features found for the specified column.');
        return;
    }

    const colorMapping = {};
    features.forEach(f => {
        const segmentId = f.properties.SegmentId;
        if (csvData[segmentId]) {
            colorMapping[segmentId] = +csvData[segmentId][column];
        }
    });

    const observedCounts = Object.values(colorMapping);
    if (observedCounts.length === 0) {
        console.error('No valid observed counts found for the specified column.');
        return;
    }

    const percentiles = calculatePercentiles(observedCounts);

    if (percentiles.length === 0) {
        console.error('No valid percentile values calculated.');
        return;
    }

    const stops = percentiles.map((percentile, index) => [percentile, colors[index]]);

    const colorExpression = ['match', ['get', 'SegmentId']];
    
    const uniqueSegmentIds = new Set();
    Object.keys(colorMapping).forEach(segmentId => {
        const countValue = colorMapping[segmentId];
        const color = stops.find(([percentile]) => countValue <= percentile)?.[1] || colors[colors.length - 1];
        colorExpression.push(segmentId, color);
        uniqueSegmentIds.add(segmentId);
    });
    
    colorExpression.push('#5c5c5c'); // default color for segments not in colorMapping

    map.setFilter('truck-count-layer', filterExpression);
    map.setPaintProperty('truck-count-layer', 'line-color', colorExpression);

    // Tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "#fff")
        .style("border", "1px solid #000")
        .style("padding", "5px");

    map.on('mousemove', 'truck-count-layer', function(e) {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['truck-count-layer']
        });

        if (features.length > 0) {
            const feature = features[0];
            const segmentId = feature.properties.SegmentId;
            const segmentName = feature.properties.SegmentName;
            const value = colorMapping[segmentId];

            tooltip.style("visibility", "visible")
                .html(`Segment: <b>${segmentName}</b><br>Value: <b>${value.toFixed(1)}</b>`)
                .style("top", (e.originalEvent.pageY - 10) + "px")
                .style("left", (e.originalEvent.pageX + 10) + "px");
        } else {
            tooltip.style("visibility", "hidden");
        }
    });

    map.on('mouseleave', 'truck-count-layer', function() {
        tooltip.style("visibility", "hidden");
    });

    // Update Legend
    const legend = document.getElementById('legend');
    legend.innerHTML = ''; // Clear previous legend items

    stops.forEach(([percentile, color], index) => {
        const item = document.createElement('div');
        item.className = 'legend-item';

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = color;

        const labelText = document.createElement('span');
        if (index === 0) {
            labelText.innerText = '0';
        } else if (index === 1) {
            labelText.innerText = `< ${Math.floor(percentile).toLocaleString()}`;
        } else if (index === stops.length - 1) {
            labelText.innerText = `> ${Math.floor(stops[index - 1][0]).toLocaleString()}`;
        } else {
            labelText.innerText = `< ${Math.floor(percentile).toLocaleString()}`;
        }

        item.appendChild(colorBox);
        item.appendChild(labelText);
        legend.appendChild(item);
    });
}

// Function to update the maximum y-value based on all road types
function updateMaxY(column) {
    d3.csv("data/count/truck_counts_time_of_day_summary.csv").then(function(data) {
        // Group data by time of day
        const groupedData = d3.groups(data, d => d.t);

        // Prepare data for stacked bar chart
        const stackData = groupedData.map(([t, values]) => {
            const stack = { t };
            ['motorway', 'trunk', 'primary'].forEach(roadType => {
                stack[roadType] = d3.sum(values, d => d.RoadType === roadType ? +d[column] : 0);
            });
            return stack;
        });

        // Update the maximum y-value
        maxY = d3.max(stackData, d => ['motorway', 'trunk', 'primary'].reduce((acc, roadType) => acc + (d[roadType] || 0), 0));

        // Update the bar chart with the new maximum y-value
        updateBarChart(column, false);
    });
}

// Function to update the maximum x-value based on all road types
function updateMaxX(columnPrefix) {
    d3.csv("data/count/truck_counts_time_of_day_summary.csv").then(function(data) {
        const selectedRoadTypes = ['motorway', 'trunk', 'primary'];
        const filteredData = data.filter(d => selectedRoadTypes.includes(d.RoadType));

        const columns = data.columns.filter(col => col.startsWith(columnPrefix));
        if (columns.length === 0) {
            console.error(`No columns found starting with ${columnPrefix}`);
            return;
        }

        const groupedData = columns.map(col => {
            const stack = { label: col };
            selectedRoadTypes.forEach(roadType => {
                stack[roadType] = d3.sum(filteredData, d => d.RoadType === roadType ? +d[col] : 0);
            });
            return stack;
        });

        maxX = d3.max(groupedData, d => selectedRoadTypes.reduce((acc, roadType) => acc + (d[roadType] || 0), 0));
    });
}

function updateBarChart(column, adjustMaxY = true) {
    // Hide the tooltip
    d3.selectAll(".tooltip").style("visibility", "hidden");
    
    d3.csv("data/count/truck_counts_time_of_day_summary.csv").then(function(data) {
        const selectedRoadTypes = getSelectedRoadTypes();
        const filteredData = data.filter(d => selectedRoadTypes.includes(d.RoadType));
        const groupedData = d3.groups(filteredData, d => d.t);
        const stackData = groupedData.map(([t, values]) => {
            const stack = { t };
            selectedRoadTypes.forEach(roadType => {
                stack[roadType] = d3.sum(values, d => d.RoadType === roadType ? +d[column] : 0);
            });
            return stack;
        });

        if (adjustMaxY) {
            maxY = d3.max(stackData, d => selectedRoadTypes.reduce((acc, roadType) => acc + (d[roadType] || 0), 0));
        }

        // Determine the chosen variable and dropdown value
        const activeButton = document.querySelector('.button-dropdown button.active');
        let chosenVariable = activeButton ? activeButton.textContent : 'None';
        let chosenDropdownValue = 'None';

        if (activeButton) {
            const buttonId = activeButton.id;
            const dropdownId = buttonId.replace('-button', '-select');
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) {
                chosenDropdownValue = dropdown.value !== 'None' ? dropdown.options[dropdown.selectedIndex].text : 'None';
            }
        }


        const margin = { top: 60, right: 30, bottom: 40, left: 60 };
        const width = document.getElementById('bar-chart').offsetWidth - margin.left - margin.right;
        const height = document.getElementById('bar-chart').offsetHeight - margin.top - margin.bottom;

        const svg = d3.select("#bar-chart")
            .html("")  
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // Add the title
        svg.append("text")
            .attr("x", (width / 2)-20)
            .attr("y", -40)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Breakdown by Time of Day (avg. by segment)");
        
        // Add the subtitle below the title
        const subtitleText = chosenDropdownValue === 'None' 
        ? 'Filter: None' 
        : `Filter: ${chosenVariable} -> ${chosenDropdownValue}`;

        svg.append("text")
            .attr("x", (width / 2) - 20)
            .attr("y", -20)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text(subtitleText);

        const x = d3.scaleBand()
            .domain(d3.range(24))
            .range([0, width])
            .padding(0.1);

        const y = d3.scaleLinear()
            .domain([0, maxY])
            .range([height, 0]);

        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x).tickFormat(d => d))
            .selectAll("text")
            .style("font-size", "12px");

        svg.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "12px");

        const stack = d3.stack()
            .keys(selectedRoadTypes)
            (stackData);

        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background", "#fff")
            .style("border", "1px solid #000")
            .style("padding", "5px");

        svg.selectAll(".layer")
            .data(stack)
            .enter().append("g")
            .attr("class", "layer")
            .attr("fill", d => roadTypeColors[d.key])
            .selectAll("rect")
            .data(d => d)
            .enter().append("rect")
            .attr("x", d => x(d.data.t))
            .attr("y", d => y(d[1]))
            .attr("height", d => y(d[0]) - y(d[1]))
            .attr("width", x.bandwidth())
            .on("mouseover", function(event, d) {
                tooltip.style("visibility", "visible")
                    .text((d[1] - d[0]).toFixed(1));
                d3.select(this).attr("stroke", "black").attr("stroke-width", 2);
            })
            .on("mousemove", function(event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function() {
                tooltip.style("visibility", "hidden");
                d3.select(this).attr("stroke", null).attr("stroke-width", null);
            });

        const legend = svg.selectAll(".legend")
            .data(selectedRoadTypes)
            .enter().append("g")
            .attr("class", "legend")
            .attr("transform", (d, i) => `translate(0,${i * 20})`);

        legend.append("rect")
            .attr("x", width - 18)
            .attr("width", 18)
            .attr("height", 18)
            .style("fill", d => roadTypeColors[d]);

        legend.append("text")
            .attr("x", width - 24)
            .attr("y", 9)
            .attr("dy", ".35em")
            .style("text-anchor", "end")
            .text(d => d.charAt(0).toUpperCase() + d.slice(1));
    });
}

// Function to update the horizontal stacked bar chart
function updateHorizontalBarChart(columnPrefix) {
    d3.csv("data/count/truck_counts_time_of_day_summary.csv").then(function(data) {
        const selectedRoadTypes = getSelectedRoadTypes();
        const filteredData = data.filter(d => selectedRoadTypes.includes(d.RoadType));

        let columns = data.columns.filter(col => col.startsWith(columnPrefix));

        // Sort NAICS codes numerically
        if (columnPrefix === 'NAICS_code_') {
            columns.sort((a, b) => {
                const numA = +a.split('_')[2];
                const numB = +b.split('_')[2];
                return numA - numB;
            });
        }

        const groupedData = columns.map(col => {
            const stack = { label: col };
            selectedRoadTypes.forEach(roadType => {
                stack[roadType] = d3.sum(filteredData, d => d.RoadType === roadType ? +d[col] : 0);
            });
            return stack;
        });

        const margin = { top: 50, right: 30, bottom: 40, left: 135 };
        const width = document.getElementById('second-plot').offsetWidth - margin.left - margin.right;
        const height = document.getElementById('second-plot').offsetHeight - margin.top - margin.bottom;

        const svg = d3.select("#second-plot")
            .style("visibility", "visible")
            .html("")  // Clear the previous SVG
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // Add the title
        const activeButton = document.querySelector('.button-dropdown button.active').textContent;
        svg.append("text")
            .attr("x", (width / 2)-60)
            .attr("y", -30)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Breakdown by " + activeButton + " (avg. by segment)");

        const x = d3.scaleLinear()
            .domain([0, maxX])
            .range([0, width]);

        const y = d3.scaleBand()
            .domain(columns)
            .range([0, height])
            .padding(0.1);

        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(",.0f")))  // Add comma for thousands
            .style("font-size", "12px");

        const yAxis = svg.append("g")
            .call(d3.axisLeft(y).tickFormat(d => abbreviateLabel(d)))
            .selectAll("text")
            .style("text-anchor", "end")
            .style("font-size", "13px")
            .attr("dx", "-0.8em")
            .attr("dy", "0.15em");

        yAxis.on("mouseover", function(event, d) {
            tooltip.transition().duration(200).style("visibility", "visible");
            tooltip.html(d)
                .style("left", (event.pageX + 5) + "px")
                .style("top", (event.pageY - 28) + "px");
        }).on("mouseout", function() {
            tooltip.transition().duration(500).style("visibility", "hidden");
        });

        const stack = d3.stack()
            .keys(selectedRoadTypes)
            (groupedData);

        svg.selectAll(".layer")
            .data(stack)
            .enter().append("g")
            .attr("class", "layer")
            .attr("fill", d => roadTypeColors[d.key])
            .selectAll("rect")
            .data(d => d)
            .enter().append("rect")
            .attr("y", d => y(d.data.label))
            .attr("x", d => x(d[0]))
            .attr("width", d => x(d[1]) - x(d[0]))
            .attr("height", y.bandwidth())
            .on("mouseover", function(event, d) {
                d3.select(this).attr("stroke", "black").attr("stroke-width", 2);
                tooltip.transition().duration(200).style("visibility", "visible");
                tooltip.html(`${(d[1] - d[0]).toFixed(1)}`)
                    .style("left", (event.pageX + 5) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mousemove", function(event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function(d) {
                d3.select(this).attr("stroke", null).attr("stroke-width", null);
                tooltip.transition().duration(500).style("visibility", "hidden");
            });


        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("visibility", "hidden");
    });
}

// Function to update the map and bar chart based on the selected column
function updateVisualizations(column, adjustMaxY = true, adjustMaxX = true) {
    currentColumn = column;
    updateMap(column);
    if (adjustMaxY) {
        updateMaxY(column);
    } else {
        updateBarChart(column, false);
    }

    // Update the horizontal bar chart based on the active button
    const activeButton = document.querySelector('.button-dropdown button.active');
    if (activeButton) {
        const columnPrefix = activeButton.id.replace('-button', '_');
        if (adjustMaxX) {
            updateMaxX(columnPrefix);
        }
        updateHorizontalBarChart(columnPrefix);
    }
}

// Function to reset dropdowns and enable the selected one
function resetAndEnableDropdown(selectedButtonId) {
    const buttons = document.querySelectorAll('.button-dropdown button');
    buttons.forEach(button => {
        button.classList.remove('active');
    });

    document.getElementById('Month-select').disabled = true;
    document.getElementById('VehicleClass-select').disabled = true;
    document.getElementById('FuelType-select').disabled = true;
    document.getElementById('Vocation-select').disabled = true;
    document.getElementById('NAICS_code-select').disabled = true;

    document.getElementById('Month-select').value = 'None';
    document.getElementById('VehicleClass-select').value = 'None';
    document.getElementById('FuelType-select').value = 'None';
    document.getElementById('Vocation-select').value = 'None';
    document.getElementById('NAICS_code-select').value = 'None';

    if (selectedButtonId === 'Month-button') {
        document.getElementById('Month-select').disabled = false;
    } else if (selectedButtonId === 'VehicleClass-button') {
        document.getElementById('VehicleClass-select').disabled = false;
    } else if (selectedButtonId === 'FuelType-button') {
        document.getElementById('FuelType-select').disabled = false;
    } else if (selectedButtonId === 'Vocation-button') {
        document.getElementById('Vocation-select').disabled = false;
    } else if (selectedButtonId === 'NAICS_code-button') {
        document.getElementById('NAICS_code-select').disabled = false;
    }

    document.getElementById(selectedButtonId).classList.add('active');
}

// Event listeners for the buttons to update the horizontal bar chart
document.getElementById('Month-button').addEventListener('click', function() {
    resetAndEnableDropdown('Month-button');
    updateVisualizations('ObservedCount');
    updateHorizontalBarChart('Month_');
});
document.getElementById('VehicleClass-button').addEventListener('click', function() {
    resetAndEnableDropdown('VehicleClass-button');
    updateVisualizations('ObservedCount');
    updateHorizontalBarChart('VehicleClass_');
});
document.getElementById('FuelType-button').addEventListener('click', function() {
    resetAndEnableDropdown('FuelType-button');
    updateVisualizations('ObservedCount');
    updateHorizontalBarChart('FuelType_');
});
document.getElementById('Vocation-button').addEventListener('click', function() {
    resetAndEnableDropdown('Vocation-button');
    updateVisualizations('ObservedCount');
    updateHorizontalBarChart('Vocation_');
});
document.getElementById('NAICS_code-button').addEventListener('click', function() {
    resetAndEnableDropdown('NAICS_code-button');
    updateVisualizations('ObservedCount');
    updateHorizontalBarChart('NAICS_code_');
});

// Event listeners for the dropdown menus
document.getElementById('Month-select').addEventListener('change', function() {
    const selectedMonth = this.value;
    const columnToUse = selectedMonth === 'None' ? 'ObservedCount' : selectedMonth;
    updateVisualizations(columnToUse, true);
});
document.getElementById('VehicleClass-select').addEventListener('change', function() {
    const selectedVehicleClass = this.value;
    const columnToUse = selectedVehicleClass === 'None' ? 'ObservedCount' : selectedVehicleClass;
    updateVisualizations(columnToUse, true);
});
document.getElementById('FuelType-select').addEventListener('change', function() {
    const selectedFuelType = this.value;
    const columnToUse = selectedFuelType === 'None' ? 'ObservedCount' : selectedFuelType;
    updateVisualizations(columnToUse, true);
});
document.getElementById('Vocation-select').addEventListener('change', function() {
    const selectedVocation = this.value;
    const columnToUse = selectedVocation === 'None' ? 'ObservedCount' : selectedVocation;
    updateVisualizations(columnToUse, true);
});
document.getElementById('NAICS_code-select').addEventListener('change', function() {
    const selectedNaicsCode = this.value;
    const columnToUse = selectedNaicsCode === 'None' ? 'ObservedCount' : selectedNaicsCode;
    updateVisualizations(columnToUse, true);
});


// Event listener for road type checkboxes
const roadTypeCheckboxes = document.querySelectorAll('.checkbox-container input[type="checkbox"]');
roadTypeCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        updateVisualizations(currentColumn, false, false);
    });
});


function abbreviateLabel(label) {
    const abbreviations = {
        "Month_1": "January",
        "Month_2": "February",
        "Month_3": "March",
        "Month_4": "April",
        "Month_5": "May",
        "Month_6": "June",
        "Month_7": "July",
        "Month_8": "August",
        "Month_9": "September",
        "Month_10": "October",
        "Month_11": "November",
        "Month_12": "December",
        "VehicleClass_Heavy": "Heavy",
        "VehicleClass_Medium": "Medium",
        "VehicleClass_Light": "Light",
        "FuelType_Diesel": "Diesel",
        "FuelType_Unknown": "Unknown",
        "FuelType_Gasoline": "Gasoline",
        "FuelType_Flexible": "Flexible",
        "Vocation_LongHaul": "Long Haul",
        "Vocation_Regional": "Regional",
        "Vocation_Local": "Local",
        "Vocation_HubAndSpoke": "Hub & Spoke",
        "Vocation_DoorToDoor": "Door to Door",
        "NAICS_code_22": "22: Utilities",
        "NAICS_code_23": "23: Construction",
        "NAICS_code_31": "31: Manufacturing",
        "NAICS_code_33": "33: Manufacturing",
        "NAICS_code_42": "42: Wholesale Trade",
        "NAICS_code_44": "44: Retail Trade",
        "NAICS_code_45": "45: Retail Trade",
        "NAICS_code_48": "48: Transportation",
        "NAICS_code_49": "49: Postal; Warehousing",
        "NAICS_code_53": "53: Real Estate; Rental; Leasing",
        "NAICS_code_54": "54: Prof., Sci., Tech. Services",
        "NAICS_code_56": "56: Admin. Support; Waste Mgmt; Remed.",
        "NAICS_code_81": "81: Other Services",
        "NAICS_code_92": "92: Public Admin."
    };
    const prefix = label.split('_')[0];
    const suffix = abbreviations[label] || label.split('_')[1];
    return suffix.length > 17 ? suffix.slice(0, 17) + "..." : suffix;
}
