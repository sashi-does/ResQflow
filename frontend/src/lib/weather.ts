import { useEffect, useState } from 'react'
import { api, type Weather } from '../api'

/** Next-24 h rain per district (Open-Meteo or its offline cache), fetched once per page. */
export function useWeather(): Weather | null {
  const [w, setW] = useState<Weather | null>(null)
  useEffect(() => {
    api.weather().then(setW, () => undefined)
  }, [])
  return w
}
