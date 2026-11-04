import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export interface DomFetcherHandle {
  fetchHtml(url: string): Promise<string | null>;
}

interface Job {
  id: number;
  url: string;
  resolve: (html: string | null) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

let nextId = 1;

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Hidden WebView used as the "headless Chrome" replacement. One page at a
 * time, with a hard timeout; callers get the rendered DOM or null.
 */
export const DomFetcher = forwardRef<DomFetcherHandle, { timeoutMs?: number }>(
  function DomFetcher({ timeoutMs = 20_000 }, ref) {
    const [active, setActive] = useState<Job | null>(null);
    const activeRef = useRef<Job | null>(null);
    const queue = useRef<Job[]>([]);
    const startNextRef = useRef<() => void>(() => {});

    const finish = useCallback((job: Job, html: string | null) => {
      if (job.timer) clearTimeout(job.timer);
      job.resolve(html && html.length > 200 ? html : null);
      if (activeRef.current?.id === job.id) {
        activeRef.current = null;
        setActive(null);
        queueMicrotask(() => startNextRef.current());
      }
    }, []);

    const startNext = useCallback(() => {
      if (activeRef.current) return;
      const job = queue.current.shift();
      if (!job) return;
      activeRef.current = job;
      job.timer = setTimeout(() => finish(job, null), timeoutMs);
      setActive(job);
    }, [finish, timeoutMs]);

    startNextRef.current = startNext;

    const fetchHtml = useCallback((url: string) => {
      return new Promise<string | null>((resolve) => {
        queue.current.push({ id: nextId++, url, resolve, timer: null });
        startNextRef.current();
      });
    }, []);

    useImperativeHandle(ref, () => ({ fetchHtml }), [fetchHtml]);

    if (!active) return null;

    return (
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          key={active.id}
          source={{ uri: active.url }}
          userAgent={DESKTOP_UA}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onMessage={(event) => {
            const job = activeRef.current;
            if (job) finish(job, event.nativeEvent.data);
          }}
          onError={() => {
            const job = activeRef.current;
            if (job) finish(job, null);
          }}
          onHttpError={() => {
            const job = activeRef.current;
            if (job) finish(job, null);
          }}
          injectedJavaScript={`(function(){
            function send(){
              try {
                window.ReactNativeWebView.postMessage(document.documentElement.outerHTML);
              } catch (e) {}
            }
            setTimeout(send, 900);
            true;
          })();`}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 360,
    height: 640,
    opacity: 0,
    left: -1000,
    top: -1000,
  },
});
