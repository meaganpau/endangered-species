var endgAnimals = {};
var MAX_CHARS_FOR_SPECIES_DESC = 300;
var endangered;
var scientificName;
var commonName;
var category;
var loading;

var MAX_PAGE_ATTEMPTS = 5;
var MAX_WIKI_ATTEMPTS = 5;

// The IUCN v4 API returns every assessment for a country, 100 per page, so we
// sample random pages until one contains threatened species.
endgAnimals.getCountryPage = function(selectedCountry, page) {
	return $.ajax({
		url: `api/countries/${selectedCountry}`,
		method: 'GET',
		dataType: 'JSON',
		data: { page: page }
	});
};

endgAnimals.getAnimals = function(selectedCountry) {
	var attempts = 0;

	function tryPage(page) {
		return endgAnimals.getCountryPage(selectedCountry, page).then(function(res, status, xhr) {
			var totalPages = parseInt(xhr.getResponseHeader('total-pages'), 10) || 1;
			var found = endgAnimals.filterAnimals(res.assessments);
			attempts++;
			if (found.length) {
				endangered = found;
				return endgAnimals.getAnimalInfo();
			}
			if (attempts < MAX_PAGE_ATTEMPTS && totalPages > 1) {
				return tryPage(Math.ceil(Math.random() * totalPages));
			}
			endgAnimals.showError('No endangered species found for this country. Try another!');
		});
	}

	// start from a random page; page 1 also tells us how many pages exist
	return endgAnimals.getCountryPage(selectedCountry, 1).then(function(res, status, xhr) {
		var totalPages = parseInt(xhr.getResponseHeader('total-pages'), 10) || 1;
		return tryPage(Math.ceil(Math.random() * totalPages));
	}).fail(function() {
		endgAnimals.showError('Something went wrong loading species data. Try another country!');
	});
};

endgAnimals.showError = function(message) {
	$('.animal-text').html($('<p>').text(message));
	$('.animal-profile').fadeIn();
	$('.loading').fadeOut();
	loading = false;
};

endgAnimals.randomAnimal = function(animals) {
	var item = Math.floor(Math.random()*animals.length);
	return animals[item];
};

endgAnimals.filterAnimals = function(animals) {
	animals = animals.filter(function(filteredAnimals) {
		return ['EN', 'CR', 'VU'].indexOf(filteredAnimals.red_list_category_code) !== -1;
	});
	return animals;
};

endgAnimals.displayAnimals = function(speciesName, animalCategory) {
	var $animalContainer = $('<article>').addClass('');
	var $animalName = $('<h3>').text(speciesName + (commonName ? ` (${commonName})` : '')).attr('title', speciesName);
	if (animalCategory === 'EN') {
		var animalCategory = 'Endangered';
	} else if (animalCategory === 'CR') {
		var animalCategory = 'Critically Endangered';
	} else {
		var animalCategory = 'Vulnerable';
	}
	var $animalCategory = $('<h4>').text('Status: ' + animalCategory);
	$animalContainer.append($animalName, $animalCategory);
	$('.animal-name').append($animalContainer);
};

// Pick a random species and look it up on Wikipedia. Species without a usable
// article are dropped from the pool and we try another, but only a few times, so a
// click can never turn into an unbounded burst of requests.
endgAnimals.getAnimalInfo = function(attempt) {
	attempt = attempt || 0;
	if (!endangered.length || attempt >= MAX_WIKI_ATTEMPTS) {
		endgAnimals.showError('Couldn\'t find a species with details for this country. Try again or pick another!');
		return;
	}
	var singleAnimal = endgAnimals.randomAnimal(endangered);
	// drop every assessment of this species so it can't be picked twice
	endangered = endangered.filter(function(animal) {
		return animal.sis_taxon_id !== singleAnimal.sis_taxon_id;
	});
	category = singleAnimal.red_list_category_code;
	scientificName = singleAnimal.taxon_scientific_name;

	return endgAnimals.getCommonName(singleAnimal.sis_taxon_id)
		.then(function() {
			return endgAnimals.searchWikipedia(endgAnimals.candidateTitles());
		})
		.then(function(page) {
			if (!page) {
				return endgAnimals.getAnimalInfo(attempt + 1);
			}
			endgAnimals.showAnimal(page);
		})
		.fail(function() {
			endgAnimals.showError('Something went wrong loading species details. Try again in a moment!');
		});
};

// Common names come from a separate IUCN endpoint; fall back to the scientific name if it fails.
endgAnimals.getCommonName = function(sisId) {
	commonName = null;
	// jQuery 1.x can't recover from a rejection with .then, so resolve a Deferred either way
	var lookup = $.Deferred();
	$.ajax({
		url: `api/taxa/${sisId}`,
		method: 'GET',
		dataType: 'JSON'
	})
	.done(function(res) {
		var english = (res.taxon.common_names || []).filter(function(name) {
			return name.language === 'eng';
		});
		var main = english.filter(function(name) { return name.main; })[0] || english[0];
		commonName = main ? main.name : null;
	})
	.always(function() {
		lookup.resolve();
	});
	return lookup.promise();
};

// The scientific name is the most reliable match, so it goes first. Common names
// widen the net when there's no article under the scientific name. Wikipedia titles
// are case-sensitive and usually sentence case ("Bluntnose sixgill shark") while
// IUCN uses title case, so try both.
endgAnimals.candidateTitles = function() {
	var titles = [scientificName];
	if (commonName) {
		titles.push(commonName);
		titles.push(commonName.charAt(0).toUpperCase() + commonName.slice(1).toLowerCase());
	}
	return titles.filter(function(title, i) { return titles.indexOf(title) === i; });
};

// One request covers every candidate title and returns the summary and lead image,
// so a lookup is a single Wikipedia call. Resolves to the best page or null.
endgAnimals.searchWikipedia = function(titles) {
	return $.ajax({
		url: 'https://en.wikipedia.org/w/api.php',
		method: 'GET',
		dataType: 'JSON',
		data: {
			format: 'json',
			action: 'query',
			prop: 'extracts|pageimages|pageprops',
			exintro: 1,
			explaintext: 1,
			exlimit: 'max',
			piprop: 'original',
			ppprop: 'disambiguation',
			titles: titles.join('|'),
			redirects: 1,
			origin: '*'
		}
	})
	.then(function(res) {
		var query = res.query;
		var pagesByTitle = {};
		$.each(query.pages, function(id, page) { pagesByTitle[page.title] = page; });
		// a requested title may have been normalized and/or redirected before landing on a page
		var aliases = {};
		(query.normalized || []).concat(query.redirects || []).forEach(function(change) {
			aliases[change.from] = change.to;
		});
		var genus = scientificName.split(' ')[0].toLowerCase();
		// titles are in preference order, so the first usable page wins
		for (var i = 0; i < titles.length; i++) {
			var title = titles[i];
			for (var hops = 0; aliases[title] && hops < 3; hops++) {
				title = aliases[title];
			}
			var page = pagesByTitle[title];
			var isDisambiguation = page && page.pageprops && 'disambiguation' in page.pageprops;
			// a common name can match an unrelated article ("Blackfish"), so unless we
			// found it by scientific name, its summary has to mention the genus
			var isSameSpecies = titles[i] === scientificName || (page && page.extract && page.extract.toLowerCase().indexOf(genus) !== -1);
			if (page && page.extract && !isDisambiguation && isSameSpecies) {
				return page;
			}
		}
		return null;
	});
};

endgAnimals.shorten = function(animalText) {
  var newText = animalText;
	if (animalText && animalText.length > MAX_CHARS_FOR_SPECIES_DESC) {	
	    var newText = animalText.substr(0,MAX_CHARS_FOR_SPECIES_DESC-3) + '&hellip;'; 
	}
	return newText;
};

endgAnimals.showAnimal = function(page) {
  endgAnimals.displayAnimals(scientificName, category);
  var $animalText = $('<p>').html(endgAnimals.shorten(page.extract));
  var $readMore = $('<a>').attr({
    href: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')),
    target: '_blank'
  }).text('(Click to read more...)');
  $('.animal-text').html($animalText);
  $('.read-more').html($readMore);
  // display ? image for when no image files were found
  endgAnimals.displayImage(page.original ? page.original.source : false, scientificName);
  $('.animal-profile').fadeIn();
  $('.loading').fadeOut();
  loading = false;
};

endgAnimals.displayImage = function(url, scientificName) {
    if (url) {
        var regex = /.svg|.pdf|.png/.test(url);
        if (regex === true) {
            var $animalimage = $('<img>').attr({
                src: 'images/question-mark.png',
                alt: 'No defined image for species.',
                title: 'No defined image for species.',
                class: 'question-mark'
            });
            $('.animal-name').append($animalimage);
        } else {
            var $animalimage = $('<img>').attr({
                src: url,
                alt: 'Photo of ' + scientificName,
                title: 'Photo of ' + scientificName,
                class: 'wiki-img'
            });
            $('.animal-name').append($animalimage);
        }
    } else {
        var $animalimage = $('<img>').attr({
            src: 'images/question-mark.png',
            title: 'No defined image for species.',
            alt: 'No defined image for species.',
            class: 'question-mark'
        });
        $('.animal-name').append($animalimage);
      }
};

endgAnimals.init = function() {
	$('.world-map').addClass('large');
	jQuery('#vmap').vectorMap({
	    map: 'world_en',
	    backgroundColor: 'transparent',
	    borderColor: 'transparent',
	    borderOpacity: 1,
	    borderWidth: 0.25,
	    color: 'rgba(255,255,255, 0.9)',
	    enableZoom: false,
	    hoverColor: '#DB504A',
	    hoverOpacity: null,
	    normalizeFunction: 'linear',
	    scaleColors: ['#b6d6ff', '#005ace'],
	    selectedColor: '#DB504A',
	    selectedRegions: null,
	    showTooltip: true,

	    //on click, grab the country code
	    onRegionClick: function(element, code, region) {
	    	// only do onclick if they havent already clicked i.e (loading is not true)
	    	if (!loading) {
	    		var selectedCountry = code.toUpperCase();
		        endgAnimals.getAnimals(selectedCountry);
		        $('.world-map').addClass('animate');
		        $('.animal-text').empty();
		        $('.read-more').empty();
				$('.animal-name').empty();
				$('.animal-profile').fadeOut();
				loading = true;
				$('.loading').fadeIn();
				return;
	    	}
	    	return;
	        
	    }
	});
};

$(function () {
	endgAnimals.init();
});
