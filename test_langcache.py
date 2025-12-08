from langcache import LangCache

api_key = "wy4ECQMIc9N5F0X5zDvgKbZ03pbji0_D5rMZs7maoiyPFGpePPZBzbUMRjxH1T0V0oIBhf49Fyfbf8f9wo2hr0lfZeZ7_Wlh80sbBF6tFhjG-ErC2o6oJjNbbT3UyMVAg2QXF5H9qCQpjIt6UtNfFXR8m3L7Z0rhbYf5BcpW2zNMOHdh6A-ZieNNqv-Q1QsTx083Qmapi_UWOq6RcaHLeVw_nN3TBLjBMSM9eKfwgxC1yeYa"

with LangCache(
    server_url="https://gcp-us-east4.langcache.redis.io",
    cache_id="a5b52dca2cf847b1b68eba9680e8a3b3",
    api_key=api_key,
) as lang_cache:

    # Save an entry
    save_response = lang_cache.set(
        prompt="How does semantic caching work?",
        response="Semantic caching stores and retrieves data based on meaning, not exact matches."
    )
    print("Save entry response:", save_response)

    # Search for entries
    search_response = lang_cache.search(
        prompt="What is semantic caching?"
    )
    print("Search entry response:", search_response)
