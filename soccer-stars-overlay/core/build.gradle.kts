plugins {
    id("org.jetbrains.kotlin.jvm")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    // OpenCV Java API. On Android the app supplies org.opencv:opencv (same classes);
    // on the desktop JVM, tests use the openpnp build which bundles native libraries.
    compileOnly("org.openpnp:opencv:4.9.0-0")
    compileOnly("com.microsoft.onnxruntime:onnxruntime:1.20.0")
    testImplementation("com.microsoft.onnxruntime:onnxruntime:1.20.0")
    testImplementation("org.openpnp:opencv:4.9.0-0")
    testImplementation(kotlin("test"))
    testImplementation("org.json:json:20240303")
}

tasks.test {
    useJUnitPlatform()
    maxHeapSize = "2g"
    testLogging {
        events("passed", "failed")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
    systemProperty("ssbot.fixtures", rootProject.file("core/src/test/resources").absolutePath)
    systemProperty("ssbot.assets", rootProject.file("app/src/main/assets").absolutePath)
}
