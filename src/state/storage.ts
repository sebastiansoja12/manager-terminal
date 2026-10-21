import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {Platform} from "react-native";

export const readJson = async <T>(key: string, fallback: T): Promise<T> => {
    try {
        const raw = await AsyncStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
};

export const writeJson = async (key: string, value: unknown): Promise<void> => {
    try {
        if (value === null || value === undefined) {
            await AsyncStorage.removeItem(key);
        } else {
            await AsyncStorage.setItem(key, JSON.stringify(value));
        }
    } catch {
    }
};

export const readSecret = async (key: string): Promise<string | null> => {
    try {
        if (Platform.OS === "web") {
            return await AsyncStorage.getItem(key);
        }
        return await SecureStore.getItemAsync(key);
    } catch {
        return null;
    }
};

export const writeSecret = async (key: string, value: string | null): Promise<void> => {
    try {
        if (Platform.OS === "web") {
            if (value) {
                await AsyncStorage.setItem(key, value);
            } else {
                await AsyncStorage.removeItem(key);
            }
            return;
        }
        if (value) {
            await SecureStore.setItemAsync(key, value);
        } else {
            await SecureStore.deleteItemAsync(key);
        }
    } catch {
    }
};
