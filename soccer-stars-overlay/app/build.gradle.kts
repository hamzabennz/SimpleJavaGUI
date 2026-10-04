plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ssbot.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.hamzabennz.ssoverlay"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        ndk {
            // Galaxy A36 and nearly all current phones are 64-bit ARM.
            abiFilters += listOf("arm64-v8a")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the APK installs directly (sideloading).
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        noCompress += "onnx"
    }

    packaging {
        jniLibs.useLegacyPackaging = true
        jniLibs.pickFirsts += "lib/**/libc++_shared.so"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core"))
    implementation("org.opencv:opencv:4.9.0")
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.20.0")
}
