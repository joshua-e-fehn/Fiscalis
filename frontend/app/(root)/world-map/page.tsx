"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import {
  Map,
  Source,
  Layer,
  Popup,
  NavigationControl,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { BarChart, PieChart, Globe2, Database } from "lucide-react";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/shadcn/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";

// Types for the API data
export interface CountryData {
  code: string; // ISO country code (e.g., "US")
  name: string; // Country name (e.g., "United States")
  value: number; // The metric value
  formattedValue: string; // Value with appropriate formatting (e.g., "$2.3T")
}

export interface DataSet {
  id: string; // Dataset identifier
  name: string; // Dataset display name
  description: string; // Description of the data
  unit: string; // Unit of measurement (e.g., "$", "%", "tons")
  dateUpdated: string; // When the data was last updated
  source: string; // Source of the data
  countries: CountryData[]; // Array of country data
}

// Map style URL (using a free alternative to Mapbox)
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const GEOJSON_URL = "data/custom.geo.json"; // Ensure you have a GeoJSON file with country boundaries

// Custom hook for fetching data
function useWorldData(datasetId: string) {
  const [data, setData] = useState<DataSet | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This will be replaced with your actual API call
    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        // Simulate API call - replace with actual API endpoint
        // const response = await fetch(`/api/world-data/${datasetId}`);
        // const data = await response.json();

        // For now, return mock data
        setTimeout(() => {
          const mockData: DataSet = {
            id: datasetId,
            name: getMockDatasetName(datasetId),
            description: `Sample data for ${getMockDatasetName(
              datasetId
            )} visualization`,
            unit:
              datasetId === "gdp"
                ? "$"
                : datasetId === "inflation"
                ? "%"
                : "tons",
            dateUpdated: "2025-03-15",
            source: "Sample Data Source",
            countries: generateMockCountryData(datasetId),
          };

          setData(mockData);
          setIsLoading(false);
        }, 800);
      } catch (err) {
        setError("Failed to fetch world data");
        setIsLoading(false);
      }
    }

    fetchData();
  }, [datasetId]);

  return { data, isLoading, error };
}

// Helper function to get mock dataset name
function getMockDatasetName(id: string): string {
  switch (id) {
    case "gdp":
      return "GDP (Nominal)";
    case "inflation":
      return "Inflation Rate";
    case "rare-earth":
      return "Rare Earth Metal Reserves";
    case "population":
      return "Population";
    default:
      return "Unknown Dataset";
  }
}

// Helper function to generate mock country data
function generateMockCountryData(datasetId: string): CountryData[] {
  // This would be replaced with real data
  const baseCountries = [
    { code: "US", name: "United States" },
    { code: "CN", name: "China" },
    { code: "JP", name: "Japan" },
    { code: "DE", name: "Germany" },
    { code: "IN", name: "India" },
    { code: "BR", name: "Brazil" },
    { code: "RU", name: "Russia" },
    { code: "GB", name: "United Kingdom" },
    { code: "FR", name: "France" },
    { code: "IT", name: "Italy" },
    // Add more countries as needed
  ];

  return baseCountries.map((country) => {
    // Generate different values based on dataset
    let value: number;
    let formattedValue: string;

    switch (datasetId) {
      case "gdp":
        value = Math.random() * 20000 + 1000; // GDP in billions
        formattedValue = `$${(value / 1000).toFixed(2)}T`;
        break;
      case "inflation":
        value = Math.random() * 10; // Inflation rate
        formattedValue = `${value.toFixed(1)}%`;
        break;
      case "rare-earth":
        value = Math.random() * 500000; // Tons
        formattedValue = `${(value / 1000).toFixed(0)}K tons`;
        break;
      case "population":
        value = Math.random() * 1000 + 50; // Population in millions
        formattedValue = `${value.toFixed(1)}M`;
        break;
      default:
        value = Math.random() * 100;
        formattedValue = value.toFixed(2);
    }

    return {
      ...country,
      value,
      formattedValue,
    };
  });
}

// Helper function to get colors for countries based on value
function getCountryColor(value: number, allValues: number[]): string {
  // Calculate median value
  const sortedValues = [...allValues].sort((a, b) => a - b);
  const mid = Math.floor(sortedValues.length / 2);
  const median =
    sortedValues.length % 2 === 0
      ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
      : sortedValues[mid];

  // Binary coloring scheme - above median is darker, below is lighter
  return value >= median ? "#1e40af" : "#93c5fd";
}

export default function WorldMapPage() {
  const [selectedDataset, setSelectedDataset] = useState<string>("gdp");
  const { data, isLoading, error } = useWorldData(selectedDataset);
  const [hoveredCountry, setHoveredCountry] = useState<{
    name: string;
    value: number;
    formattedValue: string;
    longitude: number;
    latitude: number;
  } | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);

  const [mapError, setMapError] = useState<string | null>(null);

  // Fetch GeoJSON data for the world map
  useEffect(() => {
    async function fetchGeoJson() {
      try {
        // You should place your GeoJSON in the public folder
        const response = await fetch("/data/custom.geo.json");
        if (!response.ok) throw new Error("Failed to load GeoJSON");
        const data = await response.json();
        setGeoJsonData(data);
      } catch (error) {
        console.error("Error loading GeoJSON:", error);
        setMapError("Failed to load map data");
      }
    }

    fetchGeoJson();
  }, []);

  // Process GeoJSON with the current dataset
  const processedGeoJson = useMemo(() => {
    if (!geoJsonData || !data) return null;

    // Create a deep copy of the geoJSON
    const processed = JSON.parse(JSON.stringify(geoJsonData));

    // Find min and max values for better color scaling
    const values = data.countries.map((c) => c.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    // Add the dataset values to the GeoJSON properties
    processed.features = processed.features.map((feature: any) => {
      const countryCode = feature.properties.ISO_A2;
      const countryData = data.countries.find((c) => c.code === countryCode);

      if (countryData) {
        return {
          ...feature,
          properties: {
            ...feature.properties,
            dataValue: countryData.value,
            formattedValue: countryData.formattedValue,
            normalizedValue:
              (countryData.value - minValue) / (maxValue - minValue) || 0,
          },
        };
      }
      return feature;
    });

    return processed;
  }, [geoJsonData, data]);

  // Layer style for the map
  const countryLayer = {
    id: "country-data",
    type: "fill" as const,
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "normalizedValue"],
        0,
        "#f7fbff", // Light blue/white for low values (like your original)
        1,
        "#08306b", // Dark blue for high values
      ] as any,
      "fill-opacity": 0.8, // Match your original opacity
    },
  };

  // Layer for country borders
  const borderLayer = {
    id: "country-borders",
    type: "line" as const,
    paint: {
      "line-color": "#ffffff",
      "line-width": 1,
    },
  };

  // Handle hover interaction
  const onHover = (event: any) => {
    const feature = event.features && event.features[0];

    if (feature && feature.properties) {
      const props = feature.properties;
      const countryData = data?.countries.find((c) => c.code === props.ISO_A2);

      if (countryData) {
        // Get coordinates from the event for positioning the popup
        const [longitude, latitude] = event.lngLat;

        setHoveredCountry({
          name: countryData.name,
          value: countryData.value,
          formattedValue: countryData.formattedValue,
          longitude,
          latitude,
        });
        return;
      }
    }

    // If we're not hovering over a country with data, clear the popup
    setHoveredCountry(null);
  };

  // Prepare data for the pie chart
  const pieChartData = React.useMemo(() => {
    if (!data) return null;

    // Get top 10 countries for the pie chart
    const topCountries = [...data.countries]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Calculate "Others" for remaining countries
    const othersValue = data.countries
      .filter((country) => !topCountries.find((c) => c.code === country.code))
      .reduce((sum, country) => sum + country.value, 0);

    return {
      labels: [...topCountries.map((c) => c.name), "Others"],
      datasets: [
        {
          data: [...topCountries.map((c) => c.value), othersValue],
          backgroundColor: [
            "#2563eb",
            "#3b82f6",
            "#60a5fa",
            "#93c5fd",
            "#bfdbfe",
            "#dbeafe",
            "#eff6ff",
            "#f8fafc",
            "#f1f5f9",
            "#e2e8f0",
            "#cbd5e1", // Others
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [data]);

  // Prepare data for the bar chart
  const barChartData = React.useMemo(() => {
    if (!data) return null;

    // Get top 5 countries for the bar chart
    const topCountries = [...data.countries]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      labels: topCountries.map((c) => c.name),
      datasets: [
        {
          label: data.name,
          data: topCountries.map((c) => c.value),
          backgroundColor: "#3b82f6",
          borderColor: "#2563eb",
          borderWidth: 1,
        },
      ],
    };
  }, [data]);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Globe2 className="h-8 w-8" />
        World Data Explorer
      </h1>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Select Dataset</CardTitle>
              <CardDescription>
                Choose the data metric to visualize on the world map
              </CardDescription>
            </div>
            <Select value={selectedDataset} onValueChange={setSelectedDataset}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gdp">GDP (Nominal)</SelectItem>
                <SelectItem value="inflation">Inflation Rate</SelectItem>
                <SelectItem value="rare-earth">
                  Rare Earth Metal Reserves
                </SelectItem>
                <SelectItem value="population">Population</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[500px] w-full rounded-md" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-[300px] w-full rounded-md" />
                <Skeleton className="h-[300px] w-full rounded-md" />
              </div>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-8">
              {/* World Map */}
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Globe2 className="h-5 w-5" />
                    <CardTitle>World Map: {data?.name}</CardTitle>
                  </div>
                  <CardDescription>
                    Countries colored by {data?.name}: darker blue indicates
                    higher values
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[500px] relative p-0">
                  <div className="h-full w-full">
                    {/* Interactive Map Implementation */}
                    {mapError && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertTitle>Map Error</AlertTitle>
                        <AlertDescription>{mapError}</AlertDescription>
                      </Alert>
                    )}
                    <Map
                      initialViewState={{
                        longitude: 0,
                        latitude: 20,
                        zoom: 1.5,
                      }}
                      mapStyle={MAP_STYLE}
                      style={{ width: "100%", height: "100%" }}
                      interactiveLayerIds={["country-data"]}
                      onMouseMove={onHover}
                    >
                      {processedGeoJson && (
                        <Source
                          id="countries"
                          type="geojson"
                          data={processedGeoJson}
                        >
                          <Layer {...countryLayer} />
                          <Layer {...borderLayer} />
                        </Source>
                      )}

                      {/* Map Legend */}
                      <div className="absolute bottom-5 right-5 bg-white p-3 rounded-md shadow-md">
                        <div className="text-sm font-medium mb-2">
                          {data?.name}
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-4 h-4 bg-[#c6dbef]"></div>
                          <div className="text-xs">Lower</div>
                          <div className="w-4 h-4 bg-[#4292c6]"></div>
                          <div className="text-xs">Medium</div>
                          <div className="w-4 h-4 bg-[#08306b]"></div>
                          <div className="text-xs">Higher</div>
                        </div>
                      </div>

                      {/* Navigation Controls */}
                      <NavigationControl position="top-right" />

                      {/* Popup for country data */}
                      {hoveredCountry && (
                        <Popup
                          longitude={hoveredCountry.longitude}
                          latitude={hoveredCountry.latitude}
                          closeButton={false}
                          closeOnClick={false}
                          className="z-10"
                        >
                          <div className="px-2 py-1">
                            <h3 className="font-bold">{hoveredCountry.name}</h3>
                            <p className="text-sm">
                              {data?.name}: {hoveredCountry.formattedValue}
                            </p>
                          </div>
                        </Popup>
                      )}
                    </Map>
                  </div>
                </CardContent>
              </Card>

              {/* Charts section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pie Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <PieChart className="h-5 w-5" />
                      <CardTitle>{data?.name} Distribution</CardTitle>
                    </div>
                    <CardDescription>
                      Percentage breakdown by country
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <PieChart className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <p>Pie chart will display here</p>
                        <p className="text-sm">
                          Top 10 countries by {data?.name}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Bar Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <BarChart className="h-5 w-5" />
                      <CardTitle>Top 5 Countries</CardTitle>
                    </div>
                    <CardDescription>
                      Countries with highest {data?.name} values
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <BarChart className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <p>Bar chart will display here</p>
                        <p className="text-sm">
                          Top 5 countries by {data?.name}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Dataset Information */}
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Database className="h-5 w-5" />
                    <CardTitle>Dataset Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <p className="text-sm font-medium text-muted-foreground">
                              Source
                            </p>
                            <p>{data?.source}</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Data provider information</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <p className="text-sm font-medium text-muted-foreground">
                              Last Updated
                            </p>
                            <p>{data?.dateUpdated}</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>When this dataset was last refreshed</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <p className="text-sm font-medium text-muted-foreground">
                              Countries
                            </p>
                            <p>{data?.countries.length} countries included</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Number of countries with available data</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
