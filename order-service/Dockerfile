FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn dependency:go-offline -B
COPY src/ ./src/
RUN mvn package -DskipTests -B \
    && jlink \
       --add-modules java.base,java.logging,java.xml,java.naming,java.sql,java.management,java.security.jgss,java.security.sasl,java.instrument,java.desktop,java.net.http,jdk.unsupported,jdk.crypto.ec,jdk.zipfs \
       --strip-debug \
       --no-man-pages \
       --no-header-files \
       --compress=zip-6 \
       --output /javaruntime

FROM alpine:3.21
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"
RUN adduser -D -u 10001 appuser
WORKDIR /app
COPY --from=builder /javaruntime "$JAVA_HOME"
COPY --from=builder /app/target/*.jar ./app.jar
USER 10001:10001
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD ["wget", "-qO-", "http://127.0.0.1:8082/health"]
CMD ["java", "-jar", "app.jar"]
