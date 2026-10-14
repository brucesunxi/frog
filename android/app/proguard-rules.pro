# Capacitor supplies consumer rules for Plugin subclasses and their annotated
# methods. Preserve the WebView entry point as well: JavaScript calls it by name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault

# Keep useful release stack traces; mapping.txt is generated for Play/retrace.
-keepattributes SourceFile,LineNumberTable
