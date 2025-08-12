document.addEventListener("DOMContentLoaded", function () {
  // Track active index per autocomplete field
  const state = {};

  function getOptions(name) {
    return document.querySelectorAll(`#${name}-results .${name}-option`);
  }

  function highlightOption(name) {
    const options = getOptions(name);
    options.forEach(opt => opt.classList.remove("bg-blue-100"));
    console.log('state:', state[name]);
    console.log('active index:', state[name].activeIndex);
    console.log('active element:', state[name].activeElement);
    if (state[name]?.activeIndex >= 0) {
      options[state[name].activeIndex].classList.add("bg-blue-100");
      options[state[name].activeElement] = options[state[name].activeIndex];
      options[state[name].activeIndex].scrollIntoView({ block: "nearest" });
    }
  }

  window.selectItem = function(name, id, label) {
    console.log('state:', state[name]);
    console.log('active index:', state[name].activeIndex);
    document.getElementById(`${name}-id`).value = id;
    document.getElementById(`${name}-search`).value = label;
    document.getElementById(`${name}-results`).innerHTML = '';
    state[name].activeIndex = -1;

    if (name === "customer") {
      htmx.ajax("GET", `/customers/customer-assets/${id}/`, {
      target: "#customer-assets-wrapper",
      swap: "innerHTML"
    });
  }
  };

  window.selectDevice = function(id, label) {
      const input = document.getElementById("device-search");
      const hidden = document.getElementById("device-id");

      if (input && hidden) {
        input.value = label;
        hidden.value = id;

        // Optional: clear search results
        const results = document.getElementById("device-results");
        if (results) {
          results.innerHTML = '';
        }
      }
  };

  function setupAutocomplete(name) {
    const input = document.getElementById(`${name}-search`);
    if (!input) return;

    state[name] = { activeIndex: -1 };

    input.addEventListener("keydown", function (e) {
      const options = getOptions(name);
      if (!options.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        state[name].activeIndex = (state[name].activeIndex + 1) % options.length;
        highlightOption(name);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        state[name].activeIndex = (state[name].activeIndex - 1 + options.length) % options.length;
        highlightOption(name);
      }

      if (e.key === "Enter") {
          e.preventDefault();
          if (state[name].activeIndex >= 0) {
            const selected = getOptions(name)[state[name].activeIndex];

            if (selected.dataset.action === "create") {
              // Simulate HTMX get request to create URL
              const url = selected.dataset.url;
              const target = selected.dataset.target;
              if (url && target) {
                htmx.ajax("GET", url, { target: target, swap: "innerHTML" });
              }
            } else {
              selected.click();
            }
          }
        }

      if (e.key === "Escape") {
        document.getElementById(`${name}-results`).innerHTML = '';
        state[name].activeIndex = -1;
      }
    });

    // Reset index after HTMX swap (new search results)
    document.body.addEventListener("htmx:afterSwap", function (e) {
      if (e.detail.target.id === `${name}-results`) {
        state[name].activeIndex = -1;
      }
    });
  }

  // Initialize all fields marked with data-autocomplete
  document.querySelectorAll("[data-autocomplete]").forEach(el => {
    const name = el.getAttribute("data-autocomplete");
    setupAutocomplete(name);
  });
});
