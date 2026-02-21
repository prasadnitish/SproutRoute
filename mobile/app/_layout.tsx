/**
 * Root layout — loads fonts, configures Expo Router stack navigation.
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { Colors } from "../src/constants/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.sproutLight },
          headerTintColor: Colors.sproutDark,
          headerTitleStyle: {
            fontFamily: "Nunito_700Bold",
            fontSize: 18,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="wizard/destination"
          options={{ title: "Where are you going?", headerShown: false }}
        />
        <Stack.Screen
          name="wizard/dates"
          options={{ title: "When are you going?", headerShown: false }}
        />
        <Stack.Screen
          name="wizard/kids"
          options={{ title: "Who's coming?", headerShown: false }}
        />
        <Stack.Screen name="results/index" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
