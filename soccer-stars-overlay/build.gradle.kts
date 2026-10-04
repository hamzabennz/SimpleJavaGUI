// Plugins go on the root classpath so the Kotlin and Android plugins share one class loader.
// The Android Gradle plugin is only added when an Android SDK is available (see settings.gradle.kts).
buildscript {
    val hasAndroidSdk = System.getenv("ANDROID_HOME") != null ||
        System.getenv("ANDROID_SDK_ROOT") != null ||
        file("local.properties").let { it.exists() && it.readText().contains("sdk.dir") }
    repositories {
        if (hasAndroidSdk) google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")
        if (hasAndroidSdk) classpath("com.android.tools.build:gradle:8.9.1")
    }
}
