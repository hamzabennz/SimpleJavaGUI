pluginManagement {
    val sdk = System.getenv("ANDROID_HOME") != null || System.getenv("ANDROID_SDK_ROOT") != null ||
        file("local.properties").let { it.exists() && it.readText().contains("sdk.dir") }
    repositories {
        if (sdk) google()
        mavenCentral()
        gradlePluginPortal()
    }
}

// The Android app needs an Android SDK; the pure-Kotlin core (physics, AI, vision)
// can be built and tested on any JVM without one.
val hasAndroidSdk = System.getenv("ANDROID_HOME") != null ||
    System.getenv("ANDROID_SDK_ROOT") != null ||
    file("local.properties").let { it.exists() && it.readText().contains("sdk.dir") }

dependencyResolutionManagement {
    repositories {
        if (hasAndroidSdk) google()
        mavenCentral()
    }
}

rootProject.name = "soccer-stars-overlay"

include(":core")
if (hasAndroidSdk) include(":app")
