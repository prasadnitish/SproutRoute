export default function WeatherDisplay({ weather }) {
  if (!weather || !weather.forecast) {
    return null;
  }

  const getWeatherIcon = (condition) => {
    const lower = condition.toLowerCase();
    if (lower.includes("rain") || lower.includes("shower")) return "🌧️";
    if (lower.includes("snow")) return "❄️";
    if (lower.includes("cloud") || lower.includes("overcast")) return "☁️";
    if (lower.includes("partly")) return "⛅";
    if (lower.includes("sunny") || lower.includes("clear")) return "☀️";
    if (lower.includes("storm") || lower.includes("thunder")) return "⛈️";
    return "🌤️";
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">
        Weather Forecast
      </h3>

      <div className="bg-blue-50 rounded-lg p-4 mb-4">
        <p className="text-gray-700 font-medium">{weather.summary}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {weather.forecast.slice(0, 7).map((day, index) => (
          <div
            key={index}
            className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 text-center"
          >
            <div className="text-sm font-medium text-gray-600 mb-1">
              {day.name}
            </div>
            <div className="text-3xl mb-2">{getWeatherIcon(day.condition)}</div>
            <div className="text-lg font-semibold text-gray-800">
              {day.high}°
            </div>
            {day.low && <div className="text-sm text-gray-500">{day.low}°</div>}
            {day.precipitation > 0 && (
              <div className="text-xs text-blue-600 mt-1">
                {day.precipitation}% 💧
              </div>
            )}
            <div className="text-xs text-gray-500 mt-1">{day.condition}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
